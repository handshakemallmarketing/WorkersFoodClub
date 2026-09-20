-- Ratified Q5: active employees receive free membership, while workforce and
-- membership remain separate state machines. An authority grant never itself
-- constitutes membership; this table is durable sponsorship evidence.

ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_member_type_check;
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_member_type_check
  CHECK (member_type IN ('PRIMARY','HOUSEHOLD_BENEFICIARY','EMPLOYEE_SPONSORED'));

ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_standing_check;
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_standing_check
  CHECK (standing IN ('INITIAL_FEE_DUE','CURRENT','ACTIVE','GRACE','PAST_DUE','SUSPENDED','ENDED','EMPLOYEE_SPONSORED'));

CREATE TABLE IF NOT EXISTS employee_membership_sponsorship (
  sponsorship_id text PRIMARY KEY,
  participant_id text NOT NULL REFERENCES application_participant(participant_id),
  membership_id text NOT NULL REFERENCES application_membership(membership_id),
  authority_grant_id text NOT NULL REFERENCES application_authority_grant(grant_id),
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','ENDED')),
  established_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text,
  CHECK ((state='ACTIVE' AND ended_at IS NULL) OR (state='ENDED' AND ended_at IS NOT NULL)),
  UNIQUE (membership_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_membership_one_active_sponsorship_per_participant_idx
  ON employee_membership_sponsorship(participant_id) WHERE state='ACTIVE';

COMMENT ON TABLE employee_membership_sponsorship IS
  'Durable evidence for free employee-sponsored membership. Employment/authority and membership are independent state machines; changes in one require an explicit transition in the other.';
