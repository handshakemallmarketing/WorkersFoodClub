-- Wave 2 post-merge correction: employee-sponsored/free membership entitlement.
-- Employment and membership remain separate state machines. This table is a
-- durable entitlement/link only; it never makes an employment-state transition
-- by changing application_membership, nor vice versa.

CREATE TABLE IF NOT EXISTS employee_membership_entitlement (
  entitlement_id text PRIMARY KEY,
  participant_id text NOT NULL REFERENCES application_participant(participant_id),
  employment_record_id text NOT NULL,
  membership_id text REFERENCES application_membership(membership_id),
  state text NOT NULL CHECK (state IN ('ELIGIBLE','GRANTED','REVOKED')),
  sponsorship_type text NOT NULL DEFAULT 'EMPLOYEE_SPONSORED'
    CHECK (sponsorship_type = 'EMPLOYEE_SPONSORED'),
  annual_fee_minor bigint NOT NULL DEFAULT 0 CHECK (annual_fee_minor = 0),
  employment_evidence_id text NOT NULL,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'GRANTED' AND membership_id IS NOT NULL AND granted_at IS NOT NULL) OR state <> 'GRANTED'),
  CHECK ((state = 'REVOKED' AND revoked_at IS NOT NULL) OR state <> 'REVOKED')
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_membership_entitlement_employment_uq
  ON employee_membership_entitlement(employment_record_id);
CREATE UNIQUE INDEX IF NOT EXISTS employee_membership_entitlement_membership_uq
  ON employee_membership_entitlement(membership_id)
  WHERE membership_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employee_membership_entitlement_participant_idx
  ON employee_membership_entitlement(participant_id,state);

COMMENT ON TABLE employee_membership_entitlement IS
  'Durable zero-fee membership sponsorship for active employees. Employment and membership lifecycles remain independent; changes in one require explicit reconciliation into the other.';
