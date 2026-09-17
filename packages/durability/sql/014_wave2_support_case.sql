-- Wave 2 / A10 / SUP-001
-- Forward-only creation AND upgrade of the support-case contract.

CREATE TABLE IF NOT EXISTS support_case (
  case_id text PRIMARY KEY,
  participant_id text REFERENCES application_participant(participant_id),
  subject_type text NOT NULL, subject_id text NOT NULL, category text NOT NULL, reason_code text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','IN_REVIEW','WAITING','RESOLVED','CLOSED')),
  state_version bigint NOT NULL DEFAULT 1 CHECK (state_version > 0), evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_actor_id text NOT NULL, created_by_authn_subject_ref text NOT NULL,
  updated_by_actor_id text NOT NULL, updated_by_authn_subject_ref text NOT NULL,
  command_idempotency_key text NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, closed_at timestamptz,
  CONSTRAINT support_case_actor_command_uq UNIQUE (created_by_actor_id, command_idempotency_key)
);
CREATE TABLE IF NOT EXISTS support_case_transition (
  transition_id text PRIMARY KEY, case_id text NOT NULL REFERENCES support_case(case_id), from_state text, to_state text NOT NULL CHECK (to_state IN ('OPEN','IN_REVIEW','WAITING','RESOLVED','CLOSED')),
  state_version bigint NOT NULL CHECK (state_version > 0), actor_id text NOT NULL, authn_subject_ref text NOT NULL, command_idempotency_key text NOT NULL, evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_case_transition_version_uq UNIQUE (case_id,state_version), CONSTRAINT support_case_transition_actor_command_uq UNIQUE (actor_id,command_idempotency_key)
);

-- Upgrade databases that received the superseded A10 schema before this forward migration.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_case' AND column_name='created_by_authority_ref')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_case' AND column_name='created_by_authn_subject_ref') THEN
   ALTER TABLE support_case RENAME COLUMN created_by_authority_ref TO created_by_authn_subject_ref;
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_case' AND column_name='updated_by_authority_ref')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_case' AND column_name='updated_by_authn_subject_ref') THEN
   ALTER TABLE support_case RENAME COLUMN updated_by_authority_ref TO updated_by_authn_subject_ref;
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_case_transition' AND column_name='authority_ref')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_case_transition' AND column_name='authn_subject_ref') THEN
   ALTER TABLE support_case_transition RENAME COLUMN authority_ref TO authn_subject_ref;
 END IF;
END $$;

ALTER TABLE support_case DROP CONSTRAINT IF EXISTS support_case_participant_id_fkey;
ALTER TABLE support_case ADD CONSTRAINT support_case_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES application_participant(participant_id) NOT VALID;
ALTER TABLE support_case VALIDATE CONSTRAINT support_case_participant_id_fkey;

-- Legacy opening transitions may have NULL from_state. Preserve those immutable rows; all new handler transitions are non-null.
ALTER TABLE support_case_transition DROP CONSTRAINT IF EXISTS support_case_transition_changes_state;
ALTER TABLE support_case_transition ADD CONSTRAINT support_case_transition_changes_state CHECK (from_state IS NULL OR from_state <> to_state) NOT VALID;
ALTER TABLE support_case_transition VALIDATE CONSTRAINT support_case_transition_changes_state;
ALTER TABLE support_case_transition DROP CONSTRAINT IF EXISTS support_case_transition_graph;
ALTER TABLE support_case_transition ADD CONSTRAINT support_case_transition_graph CHECK (
 from_state IS NULL OR
 (from_state='OPEN' AND to_state IN ('IN_REVIEW','WAITING','RESOLVED','CLOSED')) OR
 (from_state='IN_REVIEW' AND to_state IN ('OPEN','WAITING','RESOLVED','CLOSED')) OR
 (from_state='WAITING' AND to_state IN ('OPEN','IN_REVIEW','RESOLVED','CLOSED')) OR
 (from_state='RESOLVED' AND to_state IN ('OPEN','CLOSED')) OR
 (from_state='CLOSED' AND to_state='OPEN')
) NOT VALID;
ALTER TABLE support_case_transition VALIDATE CONSTRAINT support_case_transition_graph;

CREATE INDEX IF NOT EXISTS support_case_subject_idx ON support_case(subject_type,subject_id);
CREATE INDEX IF NOT EXISTS support_case_state_idx ON support_case(state,updated_at DESC);
COMMENT ON TABLE support_case IS 'UC-28 operational coordination record; never canonical economic or physical truth.';
COMMENT ON COLUMN support_case.created_by_authn_subject_ref IS 'Authenticated Preview subject provenance; not an authority-grant identifier.';
COMMENT ON COLUMN support_case.updated_by_authn_subject_ref IS 'Authenticated Preview subject provenance; not an authority-grant identifier.';
COMMENT ON COLUMN support_case_transition.authn_subject_ref IS 'Authenticated Preview subject provenance; not an authority-grant identifier.';
