-- Wave 2 / A10 / SUP-001
-- Support cases coordinate work; they are not economic or physical source of truth.

CREATE TABLE IF NOT EXISTS support_case (
  case_id text PRIMARY KEY,
  participant_id text,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  category text NOT NULL,
  reason_code text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN'
    CHECK (state IN ('OPEN','IN_REVIEW','WAITING','RESOLVED','CLOSED')),
  state_version bigint NOT NULL DEFAULT 1 CHECK (state_version > 0),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_actor_id text NOT NULL,
  created_by_authority_ref text NOT NULL,
  updated_by_actor_id text NOT NULL,
  updated_by_authority_ref text NOT NULL,
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
  from_state text,
  to_state text NOT NULL CHECK (to_state IN ('OPEN','IN_REVIEW','WAITING','RESOLVED','CLOSED')),
  state_version bigint NOT NULL CHECK (state_version > 0),
  actor_id text NOT NULL,
  authority_ref text NOT NULL,
  command_idempotency_key text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_case_transition_version_uq UNIQUE (case_id, state_version),
  CONSTRAINT support_case_transition_actor_command_uq UNIQUE (actor_id, command_idempotency_key)
);

CREATE INDEX IF NOT EXISTS support_case_subject_idx ON support_case(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS support_case_state_idx ON support_case(state, updated_at DESC);

COMMENT ON TABLE support_case IS
  'UC-28 operational coordination record. Case state cannot itself settle/refund obligations or mutate membership, commitment, inventory, pickup, fulfillment, or delivery truth.';
COMMENT ON COLUMN support_case.evidence_refs IS
  'References canonical evidence/events; copied assertions here are not authoritative domain truth.';
