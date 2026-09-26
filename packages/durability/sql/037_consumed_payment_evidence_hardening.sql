-- Harden every economic claim created by migration 032. This migration is
-- forward-only because 032 and 036 have already been deployed. It refuses to
-- bless contradictory history; operators must reconcile any rejected rows
-- before retrying it.

BEGIN;

-- The preflight and every hardening trigger/index/function are installed as
-- one change. These locks prevent a weak-032 claim from racing between the
-- history checks and the new enforcement boundary.
LOCK TABLE electronic_payment_evidence,
  electronic_payment_evidence_consumption,
  membership_subscription_invoice,
  membership_subscription_settlement_allocation,
  item_credit_receivable,
  item_credit_repayment_allocation
IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM membership_subscription_invoice i
    LEFT JOIN membership_subscription_settlement_allocation a
      ON a.invoice_id=i.invoice_id AND a.evidence_id=i.settlement_evidence_id
    LEFT JOIN electronic_payment_evidence e ON e.evidence_id=i.settlement_evidence_id
    LEFT JOIN electronic_payment_evidence_consumption c ON c.evidence_id=i.settlement_evidence_id
    WHERE (i.state='PAID' OR i.settlement_evidence_id IS NOT NULL)
      AND (i.state IS DISTINCT FROM 'PAID' OR i.paid_at IS NULL
        OR i.settlement_evidence_id IS NULL OR a.invoice_id IS NULL
        OR e.evidence_id IS NULL OR c.evidence_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'paid subscription invoice is missing exact durable settlement lineage';
  END IF;

  IF EXISTS (
    SELECT rail, lower(btrim(provider_reference))
    FROM electronic_payment_evidence
    WHERE provider_reference IS NOT NULL AND length(btrim(provider_reference)) > 0
    GROUP BY rail, lower(btrim(provider_reference))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'normalized duplicate provider references require reconciliation before migration 037';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM membership_subscription_settlement_allocation a
    LEFT JOIN membership_subscription_invoice i ON i.invoice_id=a.invoice_id
    LEFT JOIN electronic_payment_evidence e ON e.evidence_id=a.evidence_id
    LEFT JOIN electronic_payment_evidence_consumption c ON c.evidence_id=a.evidence_id
    WHERE i.invoice_id IS NULL OR e.evidence_id IS NULL OR c.evidence_id IS NULL
       OR i.state IS DISTINCT FROM 'PAID'
       OR i.settlement_evidence_id IS DISTINCT FROM a.evidence_id
       OR i.membership_id IS DISTINCT FROM a.membership_id
       OR i.amount_minor IS DISTINCT FROM a.amount_minor
       OR i.currency IS DISTINCT FROM a.currency
       OR e.membership_id IS DISTINCT FROM a.membership_id
       OR e.obligation_id IS DISTINCT FROM a.invoice_id
       OR e.state IS DISTINCT FROM 'RECONCILED' OR e.reconciled_at IS NULL
       OR e.amount_minor IS DISTINCT FROM a.amount_minor
       OR e.currency IS DISTINCT FROM a.currency
       OR e.rail IS DISTINCT FROM a.rail
       OR e.provider_reference IS DISTINCT FROM a.provider_reference
       OR i.paid_at IS DISTINCT FROM a.allocated_at
       OR i.paid_at IS DISTINCT FROM c.consumed_at
       OR e.reconciled_at > i.paid_at
       OR c.consumer_type IS DISTINCT FROM 'MEMBERSHIP_SUBSCRIPTION'
       OR c.consumer_id IS DISTINCT FROM a.invoice_id
       OR c.obligation_id IS DISTINCT FROM a.invoice_id
       OR c.amount_minor IS DISTINCT FROM a.amount_minor
       OR c.currency IS DISTINCT FROM a.currency
  ) THEN
    RAISE EXCEPTION 'subscription payment evidence history is not exactly reconciled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM item_credit_receivable r
    LEFT JOIN electronic_payment_evidence e ON e.evidence_id=r.deposit_evidence_id
    LEFT JOIN electronic_payment_evidence_consumption c ON c.evidence_id=r.deposit_evidence_id
    LEFT JOIN cag_deduction_enrollment d ON d.enrollment_id=r.enrollment_id
    WHERE r.deposit_evidence_id IS NOT NULL
      AND (e.evidence_id IS NULL OR c.evidence_id IS NULL
        OR d.enrollment_id IS NULL OR d.membership_id IS DISTINCT FROM r.membership_id
        OR e.membership_id IS DISTINCT FROM r.membership_id
        OR e.obligation_id IS DISTINCT FROM r.offer_id
        OR e.state IS DISTINCT FROM 'RECONCILED' OR e.reconciled_at IS NULL
        OR e.amount_minor IS DISTINCT FROM r.deposit_minor
        OR e.currency IS DISTINCT FROM 'GHS'
        OR e.provider_reference IS NULL OR length(btrim(e.provider_reference))=0
        OR c.consumer_type IS DISTINCT FROM 'ITEM_CREDIT_DEPOSIT'
        OR c.consumer_id IS DISTINCT FROM r.receivable_id
        OR c.obligation_id IS DISTINCT FROM r.receivable_id
        OR c.amount_minor IS DISTINCT FROM r.deposit_minor
        OR c.currency IS DISTINCT FROM 'GHS'
        OR c.consumed_at IS DISTINCT FROM r.created_at
        OR e.reconciled_at > c.consumed_at)
  ) THEN
    RAISE EXCEPTION 'credit deposit evidence history is not exactly reconciled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM item_credit_repayment_allocation a
    JOIN item_credit_receivable r ON r.receivable_id=a.receivable_id
    LEFT JOIN cag_deduction_enrollment d ON d.enrollment_id=r.enrollment_id
    LEFT JOIN electronic_payment_evidence e ON e.evidence_id=a.evidence_id
    LEFT JOIN electronic_payment_evidence_consumption c ON c.evidence_id=a.evidence_id
    WHERE e.evidence_id IS NULL OR c.evidence_id IS NULL
       OR d.enrollment_id IS NULL OR d.membership_id IS DISTINCT FROM r.membership_id
       OR e.membership_id IS DISTINCT FROM r.membership_id
       OR e.obligation_id IS DISTINCT FROM r.receivable_id
       OR e.state IS DISTINCT FROM 'RECONCILED' OR e.reconciled_at IS NULL
       OR e.amount_minor IS DISTINCT FROM a.amount_minor
       OR e.currency IS DISTINCT FROM 'GHS'
       OR e.provider_reference IS NULL OR length(btrim(e.provider_reference))=0
       OR c.consumer_type IS DISTINCT FROM 'ITEM_CREDIT_REPAYMENT'
       OR c.consumer_id IS DISTINCT FROM a.allocation_id
       OR c.obligation_id IS DISTINCT FROM r.receivable_id
       OR c.amount_minor IS DISTINCT FROM a.amount_minor
       OR c.currency IS DISTINCT FROM 'GHS'
       OR c.consumed_at IS DISTINCT FROM a.allocated_at
       OR e.reconciled_at > c.consumed_at
  ) THEN
    RAISE EXCEPTION 'credit repayment evidence history is not exactly reconciled';
  END IF;

  IF EXISTS (
    SELECT 1 FROM electronic_payment_evidence_consumption c
    WHERE (c.consumer_type='MEMBERSHIP_SUBSCRIPTION' AND NOT EXISTS (
             SELECT 1 FROM membership_subscription_settlement_allocation a
             WHERE a.evidence_id=c.evidence_id AND a.invoice_id=c.consumer_id))
       OR (c.consumer_type='ITEM_CREDIT_DEPOSIT' AND NOT EXISTS (
             SELECT 1 FROM item_credit_receivable r
             WHERE r.deposit_evidence_id=c.evidence_id AND r.receivable_id=c.consumer_id))
       OR (c.consumer_type='ITEM_CREDIT_REPAYMENT' AND NOT EXISTS (
             SELECT 1 FROM item_credit_repayment_allocation a
             WHERE a.evidence_id=c.evidence_id AND a.allocation_id=c.consumer_id))
  ) THEN
    RAISE EXCEPTION 'orphan payment evidence consumption requires reconciliation';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS electronic_payment_evidence_provider_event_normalized_uq
  ON electronic_payment_evidence(rail, lower(btrim(provider_reference)))
  WHERE provider_reference IS NOT NULL AND length(btrim(provider_reference)) > 0;

CREATE OR REPLACE FUNCTION claim_credit_payment_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE evidence_currency text;
BEGIN
  IF TG_TABLE_NAME='item_credit_receivable' THEN
    IF NEW.deposit_evidence_id IS NULL THEN RETURN NEW; END IF;
    SELECT e.currency INTO evidence_currency
      FROM electronic_payment_evidence e
      JOIN cag_deduction_enrollment d ON d.enrollment_id=NEW.enrollment_id
        AND d.membership_id=NEW.membership_id
      WHERE e.evidence_id=NEW.deposit_evidence_id
        AND e.membership_id=NEW.membership_id
        AND e.obligation_id=NEW.offer_id
        AND e.state='RECONCILED' AND e.reconciled_at IS NOT NULL AND e.reconciled_at<=now()
        AND e.amount_minor=NEW.deposit_minor AND e.currency='GHS'
        AND e.provider_reference IS NOT NULL AND length(btrim(e.provider_reference))>0
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'credit deposit evidence is not exactly reconciled'; END IF;
    INSERT INTO electronic_payment_evidence_consumption(
      evidence_id,consumer_type,consumer_id,obligation_id,amount_minor,currency
    ) VALUES(NEW.deposit_evidence_id,'ITEM_CREDIT_DEPOSIT',NEW.receivable_id,
             NEW.receivable_id,NEW.deposit_minor,evidence_currency);
  ELSE
    SELECT e.currency INTO evidence_currency
      FROM electronic_payment_evidence e
      JOIN item_credit_receivable r ON r.receivable_id=NEW.receivable_id
      JOIN cag_deduction_enrollment d ON d.enrollment_id=r.enrollment_id
        AND d.membership_id=r.membership_id
      WHERE e.evidence_id=NEW.evidence_id
        AND e.membership_id=r.membership_id
        AND e.obligation_id=NEW.receivable_id
        AND e.state='RECONCILED' AND e.reconciled_at IS NOT NULL AND e.reconciled_at<=now()
        AND e.amount_minor=NEW.amount_minor AND e.currency='GHS'
        AND e.provider_reference IS NOT NULL AND length(btrim(e.provider_reference))>0
      FOR UPDATE OF e;
    IF NOT FOUND THEN RAISE EXCEPTION 'credit repayment evidence is not exactly reconciled'; END IF;
    INSERT INTO electronic_payment_evidence_consumption(
      evidence_id,consumer_type,consumer_id,obligation_id,amount_minor,currency
    ) VALUES(NEW.evidence_id,'ITEM_CREDIT_REPAYMENT',NEW.allocation_id,
             NEW.receivable_id,NEW.amount_minor,evidence_currency);
  END IF;
  RETURN NEW;
END $$;

-- Preserve migration 036's renewal behavior while closing nullable exact-lineage
-- bypasses in its evidence predicate. PostgreSQL's `NULL <> value` is NULL,
-- not true, so every governed comparison must use IS DISTINCT FROM.
CREATE OR REPLACE FUNCTION settle_membership_subscription(
  requested_invoice_id text,
  requested_evidence_id text,
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
  mem application_membership%ROWTYPE;
  ev electronic_payment_evidence%ROWTYPE;
  alloc membership_subscription_settlement_allocation%ROWTYPE;
  changed integer;
  is_initial_settlement boolean;
  is_renewal_settlement boolean;
BEGIN
  IF requested_invoice_id IS NULL OR requested_evidence_id IS NULL
     OR requested_session_id IS NULL OR settled_at IS NULL THEN RETURN; END IF;

  SELECT * INTO inv FROM membership_subscription_invoice
    WHERE invoice_id=requested_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO mem FROM application_membership
    WHERE application_membership.membership_id=inv.membership_id FOR UPDATE;
  IF NOT FOUND OR mem.member_type<>'PRIMARY' OR mem.public_member_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM member_session s
    WHERE s.session_id=requested_session_id
      AND s.membership_id=mem.membership_id
      AND s.participant_id=mem.participant_id
      AND s.state='ACTIVE' AND s.expires_at>settled_at;
  IF NOT FOUND THEN RETURN; END IF;

  IF inv.state='PAID' THEN
    SELECT * INTO alloc FROM membership_subscription_settlement_allocation
      WHERE invoice_id=inv.invoice_id AND evidence_id=requested_evidence_id;
    IF FOUND AND inv.settlement_evidence_id=requested_evidence_id THEN
      membership_id:=mem.membership_id; public_member_id:=mem.public_member_id;
      membership_state:=mem.state; standing:=mem.standing; idempotent:=true;
      RETURN NEXT;
    END IF;
    RETURN;
  END IF;

  is_initial_settlement := mem.state='INACTIVE' AND mem.standing='INITIAL_FEE_DUE';
  is_renewal_settlement := mem.state='ACTIVE' AND mem.standing IN ('GRACE','RESTRICTED');
  IF inv.state<>'OPEN' OR NOT (is_initial_settlement OR is_renewal_settlement) THEN RETURN; END IF;
  IF is_renewal_settlement AND EXISTS (
    SELECT 1 FROM membership_subscription_invoice other_due
    WHERE other_due.membership_id=inv.membership_id
      AND other_due.invoice_id<>inv.invoice_id
      AND other_due.state='OPEN' AND other_due.due_at<=settled_at
  ) THEN RETURN; END IF;

  SELECT * INTO ev FROM electronic_payment_evidence
    WHERE evidence_id=requested_evidence_id FOR UPDATE;
  IF NOT FOUND OR ev.state IS DISTINCT FROM 'RECONCILED' OR ev.reconciled_at IS NULL
     OR ev.reconciled_at>settled_at
     OR ev.membership_id IS DISTINCT FROM inv.membership_id
     OR ev.obligation_id IS DISTINCT FROM inv.invoice_id
     OR ev.amount_minor IS DISTINCT FROM inv.amount_minor
     OR ev.currency IS DISTINCT FROM inv.currency
     OR ev.provider_reference IS NULL OR length(btrim(ev.provider_reference))=0 THEN RETURN; END IF;

  INSERT INTO electronic_payment_evidence_consumption(
    evidence_id,consumer_type,consumer_id,obligation_id,amount_minor,currency,consumed_at
  ) VALUES(ev.evidence_id,'MEMBERSHIP_SUBSCRIPTION',inv.invoice_id,inv.invoice_id,
           ev.amount_minor,ev.currency,settled_at)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN; END IF;

  INSERT INTO membership_subscription_settlement_allocation(
    invoice_id,evidence_id,membership_id,amount_minor,currency,rail,provider_reference,allocated_at
  ) VALUES(inv.invoice_id,ev.evidence_id,inv.membership_id,ev.amount_minor,ev.currency,
           ev.rail,ev.provider_reference,settled_at);

  UPDATE membership_subscription_invoice SET state='PAID',paid_at=settled_at,
    settlement_evidence_id=ev.evidence_id
    WHERE invoice_id=inv.invoice_id AND state='OPEN';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'subscription invoice transition lost'; END IF;

  IF is_initial_settlement THEN
    UPDATE application_membership AS target SET state='ACTIVE',standing='ACTIVE',
      activated_at=COALESCE(target.activated_at,settled_at),suspended_at=NULL
      WHERE target.membership_id=mem.membership_id
        AND target.state='INACTIVE' AND target.standing='INITIAL_FEE_DUE';
  ELSE
    UPDATE application_membership AS target SET standing='ACTIVE',
      grace_started_at=NULL,grace_ends_at=NULL
      WHERE target.membership_id=mem.membership_id
        AND target.state='ACTIVE' AND target.standing IN ('GRACE','RESTRICTED');
  END IF;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'subscription membership transition lost'; END IF;

  INSERT INTO application_access_audit(
    audit_id,participant_id,membership_id,event_type,state,outcome,request_id,occurred_at
  ) VALUES(requested_audit_id,mem.participant_id,mem.membership_id,
           CASE WHEN is_initial_settlement THEN 'MEMBERSHIP_SUBSCRIPTION_SETTLED' ELSE 'MEMBERSHIP_RENEWAL_SETTLED' END,
           'ACTIVE','TRANSITION',requested_request_id,settled_at);

  membership_id:=mem.membership_id; public_member_id:=mem.public_member_id;
  membership_state:='ACTIVE'; standing:='ACTIVE'; idempotent:=false;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION reject_consumed_payment_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM electronic_payment_evidence_consumption WHERE evidence_id=OLD.evidence_id) THEN
    RAISE EXCEPTION 'consumed payment evidence is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS consumed_payment_evidence_update_immutable_trg ON electronic_payment_evidence;
CREATE TRIGGER consumed_payment_evidence_update_immutable_trg
BEFORE UPDATE OF evidence_id,membership_id,obligation_id,rail,state,reconciled_at,amount_minor,currency,provider_reference,created_at
ON electronic_payment_evidence FOR EACH ROW
WHEN (OLD.evidence_id IS DISTINCT FROM NEW.evidence_id
   OR OLD.membership_id IS DISTINCT FROM NEW.membership_id
   OR OLD.obligation_id IS DISTINCT FROM NEW.obligation_id
   OR OLD.rail IS DISTINCT FROM NEW.rail
   OR OLD.state IS DISTINCT FROM NEW.state
   OR OLD.reconciled_at IS DISTINCT FROM NEW.reconciled_at
   OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
   OR OLD.currency IS DISTINCT FROM NEW.currency
   OR OLD.provider_reference IS DISTINCT FROM NEW.provider_reference
   OR OLD.created_at IS DISTINCT FROM NEW.created_at)
EXECUTE FUNCTION reject_consumed_payment_evidence_mutation();

DROP TRIGGER IF EXISTS consumed_payment_evidence_delete_immutable_trg ON electronic_payment_evidence;
CREATE TRIGGER consumed_payment_evidence_delete_immutable_trg
BEFORE DELETE ON electronic_payment_evidence FOR EACH ROW
EXECUTE FUNCTION reject_consumed_payment_evidence_mutation();

CREATE OR REPLACE FUNCTION reject_economic_claim_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'durable economic claim is immutable';
END $$;

CREATE OR REPLACE FUNCTION reject_claimed_credit_receivable_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deposit_evidence_id IS NOT NULL THEN
    RAISE EXCEPTION 'claimed credit receivable binding is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payment_evidence_consumption_immutable_trg ON electronic_payment_evidence_consumption;
CREATE TRIGGER payment_evidence_consumption_immutable_trg
BEFORE UPDATE OR DELETE ON electronic_payment_evidence_consumption FOR EACH ROW
EXECUTE FUNCTION reject_economic_claim_mutation();

DROP TRIGGER IF EXISTS subscription_settlement_allocation_immutable_trg ON membership_subscription_settlement_allocation;
CREATE TRIGGER subscription_settlement_allocation_immutable_trg
BEFORE UPDATE OR DELETE ON membership_subscription_settlement_allocation FOR EACH ROW
EXECUTE FUNCTION reject_economic_claim_mutation();

DROP TRIGGER IF EXISTS credit_receivable_binding_immutable_trg ON item_credit_receivable;
CREATE TRIGGER credit_receivable_binding_immutable_trg
BEFORE UPDATE OF receivable_id,membership_id,offer_id,principal_minor,deposit_minor,deposit_evidence_id,enrollment_id,created_at
ON item_credit_receivable FOR EACH ROW
WHEN (OLD.deposit_evidence_id IS NOT NULL)
EXECUTE FUNCTION reject_claimed_credit_receivable_mutation();

DROP TRIGGER IF EXISTS claimed_credit_receivable_delete_immutable_trg ON item_credit_receivable;
CREATE TRIGGER claimed_credit_receivable_delete_immutable_trg
BEFORE DELETE ON item_credit_receivable FOR EACH ROW
WHEN (OLD.deposit_evidence_id IS NOT NULL)
EXECUTE FUNCTION reject_claimed_credit_receivable_mutation();

DROP TRIGGER IF EXISTS credit_repayment_allocation_immutable_trg ON item_credit_repayment_allocation;
CREATE TRIGGER credit_repayment_allocation_immutable_trg
BEFORE UPDATE OR DELETE ON item_credit_repayment_allocation FOR EACH ROW
EXECUTE FUNCTION reject_economic_claim_mutation();

CREATE OR REPLACE FUNCTION reject_paid_subscription_reversal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'paid subscription settlement is immutable';
  END IF;
  IF NEW.state='PAID' OR NEW.paid_at IS NOT NULL OR NEW.settlement_evidence_id IS NOT NULL THEN
    IF NEW.state IS DISTINCT FROM 'PAID' OR NEW.paid_at IS NULL
       OR NEW.settlement_evidence_id IS NULL OR NOT EXISTS (
         SELECT 1
         FROM membership_subscription_settlement_allocation a
         JOIN electronic_payment_evidence e ON e.evidence_id=a.evidence_id
         JOIN electronic_payment_evidence_consumption c ON c.evidence_id=a.evidence_id
         WHERE a.invoice_id=NEW.invoice_id
           AND a.evidence_id=NEW.settlement_evidence_id
           AND a.membership_id=NEW.membership_id
           AND a.amount_minor=NEW.amount_minor AND a.currency=NEW.currency
           AND a.allocated_at=NEW.paid_at
           AND e.membership_id=NEW.membership_id
           AND e.obligation_id=NEW.invoice_id
           AND e.state='RECONCILED' AND e.reconciled_at IS NOT NULL
           AND e.reconciled_at<=NEW.paid_at
           AND e.amount_minor=NEW.amount_minor AND e.currency=NEW.currency
           AND e.rail=a.rail AND e.provider_reference=a.provider_reference
           AND e.provider_reference IS NOT NULL AND length(btrim(e.provider_reference))>0
           AND c.consumer_type='MEMBERSHIP_SUBSCRIPTION'
           AND c.consumer_id=NEW.invoice_id AND c.obligation_id=NEW.invoice_id
           AND c.amount_minor=NEW.amount_minor AND c.currency=NEW.currency
           AND c.consumed_at=NEW.paid_at
       ) THEN
      RAISE EXCEPTION 'paid subscription requires exact durable settlement lineage';
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state='PAID' THEN
      IF NEW.membership_id IS DISTINCT FROM OLD.membership_id
         OR NEW.subscription_year IS DISTINCT FROM OLD.subscription_year
         OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.due_at IS DISTINCT FROM OLD.due_at
         OR NEW.state IS DISTINCT FROM OLD.state
         OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
         OR NEW.settlement_evidence_id IS DISTINCT FROM OLD.settlement_evidence_id
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'paid subscription settlement is immutable';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS paid_subscription_insert_lineage_trg ON membership_subscription_invoice;
CREATE TRIGGER paid_subscription_insert_lineage_trg
BEFORE INSERT ON membership_subscription_invoice
FOR EACH ROW EXECUTE FUNCTION reject_paid_subscription_reversal();

DROP TRIGGER IF EXISTS paid_subscription_update_immutable_trg ON membership_subscription_invoice;
CREATE TRIGGER paid_subscription_update_immutable_trg
BEFORE UPDATE OF membership_id,subscription_year,amount_minor,currency,due_at,state,paid_at,settlement_evidence_id,created_at ON membership_subscription_invoice
FOR EACH ROW EXECUTE FUNCTION reject_paid_subscription_reversal();

DROP TRIGGER IF EXISTS paid_subscription_delete_immutable_trg ON membership_subscription_invoice;
CREATE TRIGGER paid_subscription_delete_immutable_trg
BEFORE DELETE ON membership_subscription_invoice
FOR EACH ROW WHEN (OLD.state='PAID') EXECUTE FUNCTION reject_paid_subscription_reversal();

COMMIT;
