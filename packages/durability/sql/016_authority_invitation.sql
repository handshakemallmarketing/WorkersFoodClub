-- Authority invite/revoke: lets an existing Owner or Admin delegate authority
-- to someone who has never signed in before (an "invite"), and lets an Owner
-- or Admin revoke an existing grant with an audit trail of who did it.
--
-- The invitation itself never grants anything by existing -- the actual
-- application_authority_grant row is only created at redemption time, after
-- re-verifying the inviter's authority is still valid at that moment (not
-- just at invite-creation time) and re-verifying the invitee's own fresh
-- Google identity. Only the token's SHA-256 digest is stored, never the
-- token itself, mirroring beneficiary_invitation's existing pattern.

ALTER TABLE application_authority_grant
  ADD COLUMN IF NOT EXISTS revoked_by text REFERENCES application_participant(participant_id);

CREATE TABLE IF NOT EXISTS authority_invitation (
  invitation_id text PRIMARY KEY,
  inviter_id text NOT NULL REFERENCES application_participant(participant_id),
  actions text[] NOT NULL CHECK (cardinality(actions) > 0),
  target_prefix text,
  token_digest text NOT NULL CHECK (btrim(token_digest) <> ''),
  state text NOT NULL DEFAULT 'INVITED'
    CHECK (state IN ('INVITED','ACCEPTED','REVOKED','EXPIRED')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by text REFERENCES application_participant(participant_id),
  resulting_grant_id text REFERENCES application_authority_grant(grant_id),
  revoked_at timestamptz,
  revoked_by text REFERENCES application_participant(participant_id),
  CHECK (expires_at > invited_at),
  CHECK (state <> 'ACCEPTED' OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL AND resulting_grant_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS authority_invitation_token_digest_uq
  ON authority_invitation(token_digest);

CREATE INDEX IF NOT EXISTS authority_invitation_inviter_idx
  ON authority_invitation(inviter_id, state);
