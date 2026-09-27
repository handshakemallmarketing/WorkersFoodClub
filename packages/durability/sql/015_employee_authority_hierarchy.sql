-- Employee session: the server-enforced, independently revocable elevated
-- session required in addition to a valid application_authority_grant before
-- any operator:* action is authorized. A signed opaque reference to a row
-- here, never a self-contained JWT, so revocation and expiry are always a
-- live lookup rather than something the token can outlive.
CREATE TABLE IF NOT EXISTS employee_session (
  session_id text PRIMARY KEY,
  participant_id text NOT NULL REFERENCES application_participant(participant_id),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  step_up_subject text NOT NULL,
  step_up_issuer text NOT NULL,
  step_up_token_iat timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by text,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS employee_session_participant_active_idx
  ON employee_session(participant_id)
  WHERE revoked_at IS NULL;
