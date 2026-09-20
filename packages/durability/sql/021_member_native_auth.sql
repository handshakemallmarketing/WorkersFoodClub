-- First-party member authentication. Independent of Google/OIDC.
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
CREATE INDEX IF NOT EXISTS member_auth_challenge_membership_idx ON member_auth_challenge(membership_id,created_at DESC);
CREATE TABLE IF NOT EXISTS member_session (
  session_id text PRIMARY KEY,
  membership_id text NOT NULL REFERENCES application_membership(membership_id) ON DELETE CASCADE,
  participant_id text NOT NULL REFERENCES application_participant(participant_id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','REVOKED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_session_membership_idx ON member_session(membership_id,state,expires_at);
COMMENT ON TABLE member_auth_challenge IS 'First-party WFC member verification challenge; Google/OIDC is not required.';
COMMENT ON TABLE member_session IS 'Server-backed WFC member session. Membership state remains authoritative for access.';
