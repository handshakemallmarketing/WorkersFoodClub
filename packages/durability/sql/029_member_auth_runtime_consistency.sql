-- Member-native authentication/runtime consistency.
-- Canonical flow: numbered membership -> settlement -> ACTIVE -> verified contact challenge -> server session.

CREATE TABLE IF NOT EXISTS member_auth_challenge (
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
CREATE INDEX IF NOT EXISTS member_auth_challenge_membership_idx
  ON member_auth_challenge(membership_id,created_at DESC);

CREATE TABLE IF NOT EXISTS member_session (
  session_id text PRIMARY KEY,
  membership_id text NOT NULL REFERENCES application_membership(membership_id) ON DELETE CASCADE,
  participant_id text NOT NULL REFERENCES application_participant(participant_id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','REVOKED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_session_membership_idx
  ON member_session(membership_id,state,expires_at);

ALTER TABLE application_membership ADD COLUMN IF NOT EXISTS grace_started_at timestamptz;
ALTER TABLE application_membership ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz;
ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_standing_check;
ALTER TABLE application_membership ADD CONSTRAINT application_membership_standing_check
  CHECK (standing IN ('INITIAL_FEE_DUE','ACTIVE','GRACE','RESTRICTED','SUSPENDED','ENDED'));
ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_grace_window_check;
ALTER TABLE application_membership ADD CONSTRAINT application_membership_grace_window_check
  CHECK (standing <> 'GRACE' OR (grace_started_at IS NOT NULL AND grace_ends_at = grace_started_at + interval '30 days'));

COMMENT ON TABLE member_auth_challenge IS 'First-party WFC member verification challenge; Google/OIDC is optional and not required.';
COMMENT ON TABLE member_session IS 'Server-backed WFC member session; membership lifecycle remains authoritative for access.';
