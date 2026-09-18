import { randomUUID } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { isFreshStepUp } from '../lib/employee-session.js';
import { hashInvitationToken, toAuthorityGrant } from '../lib/authority-invitation.js';
import { assertGrantIssuable, tierOf } from '../dist/packages/authority/src/hierarchy.js';

/**
 * An invitee who has never signed in before redeems a raw invitation token
 * with their own fresh Google identity. The actual application_authority_grant
 * row is only created here, after re-checking the inviter's authority as of
 * THIS moment (not assumed still valid from whenever the invite was created).
 *
 * Race note: the final claim (marking the invitation ACCEPTED) is a
 * conditional UPDATE guarded by `state='INVITED'`. If two redemption
 * requests for the same token race, the grant row for whichever one loses
 * the claim is immediately self-revoked rather than left as a second live
 * grant -- this bounds the race to "briefly created then revoked," not "two
 * permanently active grants from one invitation."
 */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const access = requireProductionApplicationAccess(options.env || process.env);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const verified = await verifyProductionOidcRequest(req, undefined, undefined, options.production || {});
  if (!verified.ok) return res.status(verified.status).json({ ok: false, error: verified.error });

  if (!isFreshStepUp(verified.principal.issuedAt, options.now ?? Date.now())) {
    return res.status(401).json({ ok: false, error: 'AUTHORITY_INVITE_REDEEM_STEP_UP_NOT_FRESH' });
  }

  const token = req.body?.token;
  if (typeof token !== 'string' || token.length === 0) {
    return res.status(400).json({ ok: false, error: 'TOKEN_REQUIRED' });
  }

  const connectionString = options.databaseUrl || process.env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) {
      const { neon } = await import('@neondatabase/serverless');
      sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } });
    }

    const invitations = await sql`
      SELECT invitation_id, inviter_id, actions, target_prefix, state, expires_at
        FROM authority_invitation
       WHERE token_digest=${hashInvitationToken(token)}
       LIMIT 1`;
    if (invitations.length !== 1) return res.status(404).json({ ok: false, error: 'INVITATION_NOT_FOUND' });
    const invitation = invitations[0];

    if (String(invitation.state) === 'ACCEPTED') return res.status(409).json({ ok: false, error: 'INVITATION_ALREADY_ACCEPTED' });
    if (String(invitation.state) === 'REVOKED') return res.status(410).json({ ok: false, error: 'INVITATION_REVOKED' });
    const expiresAtMs = invitation.expires_at instanceof Date ? invitation.expires_at.getTime() : Date.parse(String(invitation.expires_at));
    if (String(invitation.state) !== 'INVITED' || expiresAtMs <= (options.now ?? Date.now())) {
      return res.status(410).json({ ok: false, error: 'INVITATION_EXPIRED' });
    }

    const invitationId = String(invitation.invitation_id);
    const inviterId = String(invitation.inviter_id);
    const actions = Array.isArray(invitation.actions) ? invitation.actions.map(String) : [];
    const targetPrefix = invitation.target_prefix == null ? null : String(invitation.target_prefix);

    const bindings = await sql`
      SELECT participant_id, state
        FROM application_identity_binding
       WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject}
       LIMIT 2`;
    if (bindings.length > 1) return res.status(503).json({ ok: false, error: 'APPLICATION_IDENTITY_BINDING_AMBIGUOUS' });
    if (bindings.length === 1 && String(bindings[0].state) !== 'ACTIVE') {
      return res.status(403).json({ ok: false, error: 'APPLICATION_PRINCIPAL_DISABLED' });
    }
    const participantId = bindings.length === 1 ? String(bindings[0].participant_id) : `participant:${randomUUID()}`;

    const grantRows = await sql`
      SELECT grant_id, grantor_id, actor_id, actions, target_prefix, valid_from, valid_until, revoked_at, parent_grant_id
        FROM application_authority_grant
       WHERE actor_id=${inviterId}
         AND valid_from<=now()
         AND (valid_until IS NULL OR valid_until>=now())
         AND (revoked_at IS NULL OR revoked_at>now())`;
    const inviterActiveGrants = grantRows.map(toAuthorityGrant);

    try {
      assertGrantIssuable({ grantorId: inviterId, grantorActiveGrants: inviterActiveGrants, actorId: participantId, actions });
    } catch (error) {
      return res.status(403).json({ ok: false, error: error.message });
    }

    const requestedTier = tierOf(actions);
    const parentGrant = requestedTier === 'ADMIN'
      ? inviterActiveGrants.find((g) => tierOf(g.actions) === 'OWNER')
      : inviterActiveGrants.find((g) => tierOf(g.actions) === 'OWNER') || inviterActiveGrants.find((g) => tierOf(g.actions) === 'ADMIN');
    const parentGrantId = parentGrant ? parentGrant.id : null;

    const grantId = `grant:${randomUUID()}`;
    const nowIso = new Date(options.now ?? Date.now()).toISOString();
    const isNewParticipant = bindings.length === 0;

    if (isNewParticipant) {
      await sql`
        INSERT INTO application_participant(participant_id, kind, state)
        VALUES (${participantId}, 'PERSON', 'ACTIVE')`;
    }

    await sql`
      INSERT INTO application_authority_grant(grant_id, grantor_id, actor_id, actions, target_prefix, valid_from, parent_grant_id)
      VALUES (${grantId}, ${inviterId}, ${participantId}, ${actions}, ${targetPrefix}, ${nowIso}, ${parentGrantId})`;

    if (isNewParticipant) {
      const bindingId = `binding:${randomUUID()}`;
      await sql`
        INSERT INTO application_identity_binding(
          binding_id, issuer, subject, participant_id, scopes, state,
          provider_evidence_id, bound_at, bound_by, authority_grant_id
        )
        VALUES (
          ${bindingId}, ${verified.principal.issuer}, ${verified.principal.subject}, ${participantId},
          ARRAY[]::text[], 'ACTIVE',
          ${`evidence:authority-invite-redeem:${grantId}`}, ${nowIso}, ${inviterId}, ${grantId}
        )`;
    }

    const claimed = await sql`
      UPDATE authority_invitation
         SET state='ACCEPTED', accepted_at=${nowIso}, accepted_by=${participantId}, resulting_grant_id=${grantId}
       WHERE invitation_id=${invitationId} AND state='INVITED' AND expires_at>${nowIso}
      RETURNING invitation_id`;

    if (claimed.length !== 1) {
      await sql`
        UPDATE application_authority_grant
           SET revoked_at=${nowIso}, revoked_by=${inviterId}
         WHERE grant_id=${grantId} AND revoked_at IS NULL`;
      return res.status(409).json({ ok: false, error: 'INVITATION_ALREADY_REDEEMED' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({
      ok: true,
      participantId,
      grantId,
      reusedExistingIdentityBinding: !isNewParticipant,
    });
  } catch (error) {
    console.error('Authority invite redemption failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'AUTHORITY_INVITE_REDEEM_FAILED' });
  }
}
