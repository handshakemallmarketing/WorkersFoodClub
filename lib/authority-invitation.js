import { createHash, randomBytes } from 'node:crypto';

export const AUTHORITY_INVITATION_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AUTHORITY_INVITATION_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

export function generateInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Maps a raw application_authority_grant row to the shape packages/authority/src/hierarchy.ts expects. */
export function toAuthorityGrant(row) {
  return {
    id: String(row.grant_id),
    grantorId: String(row.grantor_id),
    actorId: String(row.actor_id),
    actions: Array.isArray(row.actions) ? row.actions.map(String) : [],
    targetPrefix: row.target_prefix == null ? undefined : String(row.target_prefix),
    validFrom: row.valid_from instanceof Date ? row.valid_from.toISOString() : String(row.valid_from),
    validUntil: row.valid_until == null ? undefined : (row.valid_until instanceof Date ? row.valid_until.toISOString() : String(row.valid_until)),
    revokedAt: row.revoked_at == null ? undefined : (row.revoked_at instanceof Date ? row.revoked_at.toISOString() : String(row.revoked_at)),
    parentGrantId: row.parent_grant_id == null ? undefined : String(row.parent_grant_id),
  };
}
