-- Close post-migration subscription history and Preview-sandbox atomicity gaps.
-- This migration is subscription-only. It does not authorize Production,
-- live funds, item credit, CAGD payroll, UC-08, refund, or fulfillment paths.

BEGIN;

LOCK TABLE electronic_payment_evidence,
  electronic_payment_evidence_consumption,
  membership_subscription_invoice,
  membership_subscription_settlement_allocation
IN SHARE ROW EXCLUSIVE MODE;

-- Migration 037 rejected PAID rows and rows carrying settlement evidence when
-- exact lineage was missing, but an older OPEN/VOID row could still carry a
-- stray paid_at. Refuse to build on any such contradictory historical state.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM membership_subscription_invoice i
    LEFT JOIN membership_subscription_settlement_allocation a
      ON a.invoice_id=i.invoice_id AND a.evidence_id=i.settlement_evidence_id
    LEFT JOIN electronic_payment_evidence e ON e.evidence_id=i.settlement_evidence_id
    LEFT JOIN electronic_payment_evidence_consumption c ON c.evidence_id=i.settlement_evidence_id
    WHERE (i.state='PAID' OR i.paid_at IS NOT NULL OR i.settlement_evidence_id IS NOT NULL)
      AND (i.state IS DISTINCT FROM 'PAID' OR i.paid_at IS NULL
        OR i.settlement_evidence_id IS NULL OR a.invoice_id IS NULL
        OR e.evidence_id IS NULL OR c.evidence_id IS NULL
        OR a.membership_id IS DISTINCT FROM i.membership_id
        OR a.amount_minor IS DISTINCT FROM i.amount_minor
        OR a.currency IS DISTINCT FROM i.currency
        OR a.allocated_at IS DISTINCT FROM i.paid_at
        OR e.membership_id IS DISTINCT FROM i.membership_id
        OR e.obligation_id IS DISTINCT FROM i.invoice_id
        OR e.state IS DISTINCT FROM 'RECONCILED' OR e.reconciled_at IS NULL
        OR e.reconciled_at > i.paid_at
        OR e.amount_minor IS DISTINCT FROM i.amount_minor
        OR e.currency IS DISTINCT FROM i.currency
        OR e.rail IS DISTINCT FROM a.rail
        OR e.provider_reference IS DISTINCT FROM a.provider_reference
        OR c.consumer_type IS DISTINCT FROM 'MEMBERSHIP_SUBSCRIPTION'
        OR c.consumer_id IS DISTINCT FROM i.invoice_id
        OR c.obligation_id IS DISTINCT FROM i.invoice_id
        OR c.amount_minor IS DISTINCT FROM i.amount_minor
        OR c.currency IS DISTINCT FROM i.currency
        OR c.consumed_at IS DISTINCT FROM i.paid_at)
  ) THEN
    RAISE EXCEPTION 'subscription invoice has contradictory historical paid state';
  END IF;
END $$;

COMMIT;
