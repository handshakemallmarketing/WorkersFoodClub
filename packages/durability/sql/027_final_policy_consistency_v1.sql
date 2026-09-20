-- Final owner-approved policy consistency reconciliation, 2026-09-19.
-- 1) 30-day membership grace is explicit and precedes restriction.
-- 2) Demand qualification is offer-specific, not a universal 30% rule.
-- 3) Already-paid value preserved after a deadline is a member prepaid/refundable
--    balance, not credit extended by WorkersFoodClub.

ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_standing_check;
ALTER TABLE application_membership
  ADD COLUMN IF NOT EXISTS grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz;

-- Replace the inline standing CHECK created by migration 019 regardless of its generated name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='application_membership'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%standing%'
  LOOP
    EXECUTE format('ALTER TABLE application_membership DROP CONSTRAINT %I',r.conname);
  END LOOP;
END $$;
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_standing_check
  CHECK (standing IN ('INITIAL_FEE_DUE','CURRENT','GRACE','RESTRICTED','SUSPENDED','ENDED'));
ALTER TABLE application_membership
  ADD CONSTRAINT application_membership_grace_window_check
  CHECK ((standing<>'GRACE') OR (grace_started_at IS NOT NULL AND grace_ends_at=grace_started_at+interval '30 days'));

ALTER TABLE preview_member_offer
  ADD COLUMN IF NOT EXISTS demand_qualification_bps integer NOT NULL DEFAULT 3000
    CHECK (demand_qualification_bps BETWEEN 1 AND 10000);
COMMENT ON COLUMN preview_member_offer.demand_qualification_bps IS
  'Versioned offer-specific minimum commitment/qualification threshold. 3000 is a migration compatibility default, not a constitutional universal threshold.';

-- Rename the pre-launch ledger to state its actual economic character. This is
-- paid member value held as a liability, not lending/credit authority.
ALTER TABLE IF EXISTS member_shopping_credit_ledger RENAME TO member_prepaid_balance_ledger;
ALTER TABLE IF EXISTS member_prepaid_balance_ledger RENAME COLUMN credit_entry_id TO balance_entry_id;
DROP INDEX IF EXISTS member_shopping_credit_participant_state_idx;
CREATE INDEX IF NOT EXISTS member_prepaid_balance_participant_state_idx
  ON member_prepaid_balance_ledger(participant_id,state,created_at DESC);
COMMENT ON TABLE member_prepaid_balance_ledger IS
  'Member-owned paid-value liability: merchandise-applied value plus prepaid/refundable balance equals source paid value. This table does not authorize member credit.';
