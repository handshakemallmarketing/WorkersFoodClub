-- J14 household beneficiary invitation/activation durability.
-- Invitation possession is proven by a high-entropy token; only its SHA-256 hash
-- is persisted. Household beneficiaries consume one of the sponsor's two slots.

ALTER TABLE household_beneficiary_invitation
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by_participant_id text REFERENCES application_participant(participant_id),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS household_beneficiary_invitation_token_hash_uq
  ON household_beneficiary_invitation(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS household_beneficiary_invitation_expiry_idx
  ON household_beneficiary_invitation(state, expires_at);

COMMENT ON COLUMN household_beneficiary_invitation.token_hash IS
  'SHA-256 hash of the single-use invitation bearer token; plaintext token is never persisted.';
