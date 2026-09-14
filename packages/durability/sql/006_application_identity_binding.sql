CREATE TABLE IF NOT EXISTS application_identity_binding (
  binding_id text PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  participant_id text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  state text NOT NULL CHECK (state IN ('ACTIVE','DISABLED')),
  provider_evidence_id text NOT NULL,
  bound_at timestamptz NOT NULL,
  bound_by text NOT NULL,
  authority_grant_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS application_identity_binding_participant_idx
  ON application_identity_binding(participant_id);
