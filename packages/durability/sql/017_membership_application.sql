-- Self-service "apply to join" pathway: lets a Google identity with no
-- WorkersFoodClub membership submit a request, and lets an Owner/Admin
-- approve it (creating the real application_membership row) or reject it.
-- Mirrors authority_invitation's shape: the application itself never grants
-- membership by existing -- only approval, via api/membership-application-decide.js,
-- creates the actual application_membership row.

-- Every prior identity_binding creator (owner-bootstrap, authority-invite-
-- redeem) always had a real authority grant to reference. A plain member
-- binding created from an approved membership application has no
-- accompanying authority grant at all, so this NOT NULL constraint must
-- become optional.
ALTER TABLE application_identity_binding
  ALTER COLUMN authority_grant_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS membership_application (
  application_id text PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  contact_note text,
  state text NOT NULL DEFAULT 'SUBMITTED'
    CHECK (state IN ('SUBMITTED','APPROVED','REJECTED')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text REFERENCES application_participant(participant_id),
  resulting_membership_id text REFERENCES application_membership(membership_id),
  CHECK (state = 'SUBMITTED' OR decided_at IS NOT NULL),
  CHECK (state <> 'APPROVED' OR (decided_by IS NOT NULL AND resulting_membership_id IS NOT NULL)),
  CHECK (state <> 'REJECTED' OR decided_by IS NOT NULL)
);

-- At most one pending application per identity at a time.
CREATE UNIQUE INDEX IF NOT EXISTS membership_application_pending_identity_uq
  ON membership_application(issuer, subject)
  WHERE state = 'SUBMITTED';

CREATE INDEX IF NOT EXISTS membership_application_state_idx
  ON membership_application(state, submitted_at);
