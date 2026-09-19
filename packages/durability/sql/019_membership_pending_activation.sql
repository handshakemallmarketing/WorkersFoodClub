-- J4: approval is not activation. Extend membership state so an approved
-- applicant can have a durable membership record without member privileges.
ALTER TABLE application_membership
  DROP CONSTRAINT IF EXISTS application_membership_state_check;
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_state_check
  CHECK (state IN ('PENDING_ACTIVATION','ACTIVE','SUSPENDED','ENDED'));

CREATE UNIQUE INDEX IF NOT EXISTS application_membership_one_pending_activation_per_participant_idx
  ON application_membership(participant_id)
  WHERE state = 'PENDING_ACTIVATION';
