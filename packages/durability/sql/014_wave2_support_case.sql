-- Wave 2 / A10 / SUP-001
-- Support cases coordinate work; they are not economic or physical source of truth.
CREATE TABLE IF NOT EXISTS support_case (
  case_id text PRIMARY KEY,
  participant_id text REFERENCES application_participant(participant_id),
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  category text NOT NULL,
  reason_code text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','IN_REVIEW','WAITING','RESOLVED','CLOSED')),
  state_version bigint NOT NULL DEFAULT 1 CHECK (state_version > 0),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_actor_id text NOT NULL,
  created_by_authn_subject_ref text NOT NULL,
  updated_by_actor_id text NOT NULL,
  updated_by_authn_subject_ref text NOT NULL,
  command_idempotency_key text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT support_case_actor_command_uq UNIQUE (created_by_actor_id, command_idempotency_key)
);
CREATE TABLE IF NOT EXISTS support_case_transition (
  transition_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES support_case(case_id),
  from_state text NOT NULL,
  to_state text NOT NULL CHECK (to_state IN ('OPEN','IN_REVIEW','WAITING','RESOLVED','CLOSED')),
  state_version bigint NOT NULL CHECK (state_version > 0),
  actor_id text NOT NULL,
  authn_subject_ref text NOT NULL,
  command_idempotency_key text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_case_transition_version_uq UNIQUE (case_id, state_version),
  CONSTRAINT support_case_transition_actor_command_uq UNIQUE (actor_id, command_idempotency_key),
  CONSTRAINT support_case_transition_changes_state CHECK (from_state <> to_state),
  CONSTRAINT support_case_transition_graph CHECK (
    (from_state='OPEN' AND to_state IN ('IN_REVIEW','WAITING','RESOLVED','CLOSED')) OR
    (from_state='IN_REVIEW' AND to_state IN ('OPEN','WAITING','RESOLVED','CLOSED')) OR
    (from_state='WAITING' AND to_state IN ('OPEN','IN_REVIEW','RESOLVED','CLOSED')) OR
    (from_state='RESOLVED' AND to_state IN ('OPEN','CLOSED')) OR
    (from_state='CLOSED' AND to_state='OPEN')
  )
);
CREATE INDEX IF NOT EXISTS support_case_subject_idx ON support_case(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS support_case_state_idx ON support_case(state, updated_at DESC);
COMMENT ON TABLE support_case IS 'UC-28 operational coordination record. Case state cannot itself settle/refund obligations or mutate membership, commitment, inventory, pickup, fulfillment, or delivery truth.';
COMMENT ON COLUMN support_case.evidence_refs IS 'References canonical evidence/events; copied assertions here are not authoritative domain truth.';
COMMENT ON COLUMN support_case.created_by_authn_subject_ref IS 'Authenticated Preview subject provenance. This is not an authority-grant identifier.';
COMMENT ON COLUMN support_case.updated_by_authn_subject_ref IS 'Authenticated Preview subject provenance. This is not an authority-grant identifier.';
COMMENT ON COLUMN support_case_transition.authn_subject_ref IS 'Authenticated Preview subject provenance. This is not an authority-grant identifier.';
