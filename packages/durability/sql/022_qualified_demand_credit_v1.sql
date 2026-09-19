-- Owner-ratified UC-08/UC-10 policy, 2026-09-19.
-- 30% cumulative eligible payment qualifies pooled demand.
-- 100% is due 24 hours before scheduled delivery.
-- Missed deadline converts 100% of amount paid to shopping credit, with no deductions or penalties.

ALTER TABLE application_membership
  ADD COLUMN IF NOT EXISTS public_member_id text;
CREATE UNIQUE INDEX IF NOT EXISTS application_membership_public_member_id_uq
  ON application_membership(public_member_id) WHERE public_member_id IS NOT NULL;

ALTER TABLE preview_member_offer
  ADD COLUMN IF NOT EXISTS delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS full_payment_discount_bps integer NOT NULL DEFAULT 0
    CHECK (full_payment_discount_bps BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS discount_deadline_at timestamptz;

ALTER TABLE preview_sandbox_payment
  DROP CONSTRAINT IF EXISTS preview_sandbox_payment_obligation_id_key;
CREATE INDEX IF NOT EXISTS preview_sandbox_payment_obligation_status_idx
  ON preview_sandbox_payment(obligation_id,status,observed_at);

ALTER TABLE preview_member_commitment
  ADD COLUMN IF NOT EXISTS qualification_state text NOT NULL DEFAULT 'UNQUALIFIED'
    CHECK (qualification_state IN ('UNQUALIFIED','QUALIFIED','FULLY_PAID','DEADLINE_MISSED','CREDITED')),
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS fully_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_quantity numeric NOT NULL DEFAULT 0 CHECK (released_quantity >= 0);

CREATE TABLE IF NOT EXISTS member_shopping_credit_ledger (
  credit_entry_id text PRIMARY KEY,
  participant_id text NOT NULL,
  membership_id text NOT NULL,
  obligation_id text NOT NULL REFERENCES preview_member_commitment(obligation_id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency='GHS'),
  reason text NOT NULL CHECK (reason='DELIVERY_DEADLINE_MISSED'),
  state text NOT NULL DEFAULT 'AVAILABLE' CHECK (state IN ('AVAILABLE','APPLIED','VOID')),
  source_paid_minor bigint NOT NULL CHECK (source_paid_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, reason),
  CHECK (amount_minor = source_paid_minor)
);
CREATE INDEX IF NOT EXISTS member_shopping_credit_participant_state_idx
  ON member_shopping_credit_ledger(participant_id,state,created_at DESC);

COMMENT ON TABLE member_shopping_credit_ledger IS
  'Shopping-credit liability ledger. Deadline-miss credit equals 100% of eligible amount paid; no deduction, penalty, or cash-refund haircut.';
