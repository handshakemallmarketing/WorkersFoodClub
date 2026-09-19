-- Owner-ratified membership lifecycle v3.
-- Primary approval creates a membership, but it remains INACTIVE until the
-- annual subscription invoice is settled. Household beneficiaries have their
-- own invitation/activation lifecycle and inherit sponsor standing constraints.

ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_state_check;
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_state_check
  CHECK (state IN ('INACTIVE','ACTIVE','SUSPENDED','ENDED'));

ALTER TABLE application_membership
  ADD COLUMN IF NOT EXISTS member_type text NOT NULL DEFAULT 'PRIMARY'
    CHECK (member_type IN ('PRIMARY','HOUSEHOLD_BENEFICIARY')),
  ADD COLUMN IF NOT EXISTS standing text NOT NULL DEFAULT 'INITIAL_FEE_DUE'
    CHECK (standing IN ('INITIAL_FEE_DUE','CURRENT','PAST_DUE','SUSPENDED','ENDED')),
  ADD COLUMN IF NOT EXISTS sponsoring_membership_id text REFERENCES application_membership(membership_id),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- The application-level activation_state introduced in 018 applies to invited
-- household beneficiaries only; primary application approval is not activation.
COMMENT ON COLUMN membership_application.activation_state IS
  'Reserved for activation-bearing journeys such as invited household beneficiaries; primary approval creates an INACTIVE membership pending annual subscription settlement.';

CREATE TABLE IF NOT EXISTS membership_subscription_invoice (
  invoice_id text PRIMARY KEY,
  membership_id text NOT NULL REFERENCES application_membership(membership_id),
  subscription_year integer NOT NULL CHECK (subscription_year >= 2026),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','PAID','VOID')),
  due_at timestamptz NOT NULL,
  paid_at timestamptz,
  settlement_evidence_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, subscription_year)
);

CREATE TABLE IF NOT EXISTS household_beneficiary_invitation (
  invitation_id text PRIMARY KEY,
  sponsoring_membership_id text NOT NULL REFERENCES application_membership(membership_id),
  beneficiary_membership_id text REFERENCES application_membership(membership_id),
  contact_email text,
  contact_phone text,
  state text NOT NULL DEFAULT 'APPROVED_PENDING_ACTIVATION'
    CHECK (state IN ('APPROVED_PENDING_ACTIVATION','ACTIVE','REVOKED','EXPIRED')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  CHECK (contact_email IS NOT NULL OR contact_phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS membership_subscription_invoice_state_due_idx
  ON membership_subscription_invoice(state, due_at);
CREATE INDEX IF NOT EXISTS household_beneficiary_sponsor_idx
  ON household_beneficiary_invitation(sponsoring_membership_id, state);
