-- Member Number recovery is identity recovery, not membership activation.
CREATE TABLE IF NOT EXISTS member_number_recovery_challenge (
  challenge_id text PRIMARY KEY,
  membership_id text NOT NULL REFERENCES application_membership(membership_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('EMAIL','PHONE')),
  destination_hash text NOT NULL,
  code_hash text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','USED','EXPIRED','REVOKED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_number_recovery_membership_idx ON member_number_recovery_challenge(membership_id,created_at DESC);
COMMENT ON TABLE member_number_recovery_challenge IS 'Single-use verified-contact challenges for recovering an immutable Member Number. Recovery never changes membership standing or rights.';
