-- Final owner-approved policy consistency reconciliation, 2026-09-19.
-- 1) 30-day membership grace is explicit and precedes restriction.
-- 2) Demand qualification is offer-specific, not a universal 30% rule.
-- 3) Already-paid value preserved after a deadline is a member prepaid/refundable
--    balance, not credit extended by WorkersFoodClub.
--
-- GOVERNANCE SUPERSESSION NOTE:
-- Migration 022 is preserved as immutable historical migration evidence. Its comments
-- describing a universal 30% demand-qualification threshold as "Owner-ratified" and
-- describing preserved already-paid member value as "shopping credit" are superseded
-- by WorkersFoodClub Policy Ratification Register v1.1, specifically PR-15 and PR-19,
-- and by this migration. Existing offers are backfilled to 30% solely to preserve their
-- pre-ratification behavior. Future offers MUST explicitly declare their governed
-- demand_qualification_bps; there is no database or runtime universal default.
-- Likewise, member_prepaid_balance_ledger records member-owned already-paid/refundable
-- value and does not authorize lending or member credit. Historical migration 022
-- terminology MUST NOT be interpreted as current owner-ratified policy.

ALTER TABLE application_membership DROP CONSTRAINT IF EXISTS application_membership_standing_check;
ALTER TABLE application_membership
  ADD COLUMN IF NOT EXISTS grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz;

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

-- Preserve existing offers at their historical behavior, then require every future
-- offer to state the governed qualification threshold explicitly.
ALTER TABLE preview_member_offer
  ADD COLUMN IF NOT EXISTS demand_qualification_bps integer;
UPDATE preview_member_offer SET demand_qualification_bps=3000 WHERE demand_qualification_bps IS NULL;
ALTER TABLE preview_member_offer ALTER COLUMN demand_qualification_bps DROP DEFAULT;
ALTER TABLE preview_member_offer ALTER COLUMN demand_qualification_bps SET NOT NULL;
ALTER TABLE preview_member_offer DROP CONSTRAINT IF EXISTS preview_member_offer_demand_qualification_bps_check;
ALTER TABLE preview_member_offer
  ADD CONSTRAINT preview_member_offer_demand_qualification_bps_check
  CHECK (demand_qualification_bps BETWEEN 1 AND 10000);
COMMENT ON COLUMN preview_member_offer.demand_qualification_bps IS
  'Required versioned offer-specific minimum commitment/qualification threshold. Existing pre-ratification offers were compatibility-backfilled to 3000; future offers must explicitly declare a value.';

ALTER TABLE IF EXISTS member_shopping_credit_ledger RENAME TO member_prepaid_balance_ledger;
ALTER TABLE IF EXISTS member_prepaid_balance_ledger RENAME COLUMN credit_entry_id TO balance_entry_id;
DROP INDEX IF EXISTS member_shopping_credit_participant_state_idx;
CREATE INDEX IF NOT EXISTS member_prepaid_balance_participant_state_idx
  ON member_prepaid_balance_ledger(participant_id,state,created_at DESC);
COMMENT ON TABLE member_prepaid_balance_ledger IS
  'Member-owned paid-value liability: merchandise-applied value plus prepaid/refundable balance equals source paid value. This table does not authorize member credit.';
