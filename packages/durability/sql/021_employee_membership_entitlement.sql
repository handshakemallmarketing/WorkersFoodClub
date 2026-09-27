-- Ratified Q5 convergence: employment, sponsorship, membership, and operator
-- authority are distinct concepts. Employment is authoritative for employee
-- status; this entitlement records why annual membership fees are waived.
-- It does not itself grant operator authority or mutate employment state.

-- Normalize legacy standing values before tightening the constraint. ACTIVE is
-- paid/current standing; PAST_DUE enters the ratified grace lifecycle; ENDED is
-- the terminal standing name in the canonical policy kernel.
ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_member_type_check;
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_member_type_check
  CHECK (member_type IN ('PRIMARY','HOUSEHOLD_BENEFICIARY','EMPLOYEE_SPONSORED'));

ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_standing_check;
UPDATE application_membership SET standing='ACTIVE' WHERE standing='CURRENT';
UPDATE application_membership SET standing='GRACE' WHERE standing='PAST_DUE';
UPDATE application_membership SET standing='TERMINATED' WHERE standing='ENDED';
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_standing_check
  CHECK (standing IN ('INITIAL_FEE_DUE','ACTIVE','GRACE','RESTRICTED','SUSPENDED','TERMINATED'));

CREATE TABLE IF NOT EXISTS employee_employment (
  employment_record_id text PRIMARY KEY,
  participant_id text NOT NULL REFERENCES application_participant(participant_id),
  state text NOT NULL CHECK (state IN ('ACTIVE','INACTIVE','TERMINATED')),
  evidence_id text NOT NULL,
  effective_at timestamptz NOT NULL,
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state='ACTIVE' AND ended_at IS NULL) OR state<>'ACTIVE')
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_one_active_employment_idx
  ON employee_employment(participant_id) WHERE state='ACTIVE';

CREATE TABLE IF NOT EXISTS employee_membership_entitlement (
  entitlement_id text PRIMARY KEY,
  participant_id text NOT NULL REFERENCES application_participant(participant_id),
  employment_record_id text NOT NULL REFERENCES employee_employment(employment_record_id),
  membership_id text REFERENCES application_membership(membership_id),
  state text NOT NULL CHECK (state IN ('ELIGIBLE','GRANTED','ENDED')),
  sponsorship_type text NOT NULL DEFAULT 'EMPLOYEE_SPONSORED' CHECK (sponsorship_type='EMPLOYEE_SPONSORED'),
  annual_fee_minor bigint NOT NULL DEFAULT 0 CHECK (annual_fee_minor=0),
  granted_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state='GRANTED' AND membership_id IS NOT NULL AND granted_at IS NOT NULL AND ended_at IS NULL) OR state<>'GRANTED'),
  CHECK ((state='ENDED' AND ended_at IS NOT NULL) OR state<>'ENDED')
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_membership_entitlement_employment_uq ON employee_membership_entitlement(employment_record_id);
CREATE UNIQUE INDEX IF NOT EXISTS employee_membership_entitlement_membership_uq ON employee_membership_entitlement(membership_id) WHERE membership_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employee_membership_one_active_entitlement_idx ON employee_membership_entitlement(participant_id) WHERE state='GRANTED';

COMMENT ON TABLE employee_employment IS 'Authoritative workforce state, independent of membership and operator authority.';
COMMENT ON TABLE employee_membership_entitlement IS 'Zero-fee sponsorship entitlement derived from active employment. Ending sponsorship does not itself terminate membership or operator authority.';
