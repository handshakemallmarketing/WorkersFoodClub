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

-- The Preview simulator must synthesize evidence only after it has serialized
-- the exact invoice. If the governed settlement function rejects the payment,
-- raising from this wrapper rolls back the freshly inserted evidence as part of
-- the same database transaction.
CREATE OR REPLACE FUNCTION simulate_and_settle_membership_subscription(
  requested_invoice_id text,
  requested_membership_id text,
  requested_evidence_id text,
  requested_rail text,
  requested_provider_reference text,
  requested_session_id text,
  requested_audit_id text,
  requested_request_id text,
  settled_at timestamptz
) RETURNS TABLE(
  membership_id text,
  public_member_id text,
  membership_state text,
  standing text,
  idempotent boolean
) LANGUAGE plpgsql AS $$
DECLARE
  inv membership_subscription_invoice%ROWTYPE;
  changed integer;
BEGIN
  IF requested_invoice_id IS NULL OR requested_membership_id IS NULL
     OR requested_evidence_id IS NULL OR requested_session_id IS NULL
     OR requested_provider_reference IS NULL
     OR length(btrim(requested_provider_reference))=0
     OR requested_rail NOT IN ('MOBILE_MONEY','BANK_TRANSFER','CAGD_PAYROLL')
     OR settled_at IS NULL THEN RETURN; END IF;

  SELECT * INTO inv
  FROM membership_subscription_invoice
  WHERE invoice_id=requested_invoice_id
    AND membership_id=requested_membership_id
  FOR UPDATE;
  IF NOT FOUND OR inv.state<>'OPEN' THEN RETURN; END IF;

  INSERT INTO electronic_payment_evidence(
    evidence_id,membership_id,obligation_id,rail,state,amount_minor,currency,
    provider_reference,reconciled_at
  ) VALUES(
    requested_evidence_id,requested_membership_id,requested_invoice_id,
    requested_rail,'RECONCILED',inv.amount_minor,inv.currency,
    requested_provider_reference,settled_at
  );

  RETURN QUERY
  SELECT * FROM settle_membership_subscription(
    requested_invoice_id,requested_evidence_id,requested_session_id,
    requested_audit_id,requested_request_id,settled_at
  );
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN
    RAISE EXCEPTION 'sandbox subscription settlement rejected after evidence synthesis';
  END IF;
END $$;

COMMIT;
