-- J3-J5 entry-journey durability. Approval and activation are deliberately
-- separate: an approved application is not an ACTIVE membership until UC-02
-- activation completes.

ALTER TABLE membership_application
  ADD COLUMN IF NOT EXISTS activation_state text NOT NULL DEFAULT 'NOT_APPROVED'
    CHECK (activation_state IN ('NOT_APPROVED','APPROVED_PENDING_ACTIVATION','ACTIVATED')),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

ALTER TABLE application_membership
  ADD COLUMN IF NOT EXISTS public_member_id text;

CREATE UNIQUE INDEX IF NOT EXISTS application_membership_public_member_id_uq
  ON application_membership(public_member_id)
  WHERE public_member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_access_audit (
  audit_id text PRIMARY KEY,
  participant_id text REFERENCES application_participant(participant_id),
  membership_id text REFERENCES application_membership(membership_id),
  application_id text REFERENCES membership_application(application_id),
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  state text,
  outcome text NOT NULL CHECK (outcome IN ('ALLOWED','DENIED','TRANSITION')),
  request_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_access_audit_participant_time_idx
  ON application_access_audit(participant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS application_access_audit_membership_time_idx
  ON application_access_audit(membership_id, occurred_at DESC);
