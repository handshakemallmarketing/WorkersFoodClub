-- Annual subscription settlement may consume only exact, durable payment
-- evidence.  The generic consumption ledger prevents one economic event from
-- being reused by subscription, credit-deposit, or credit-repayment paths.

DO $$
BEGIN
  IF to_regclass('public.electronic_payment_evidence') IS NULL THEN
    RAISE EXCEPTION 'electronic_payment_evidence is required before migration 032';
  END IF;
  IF to_regclass('public.membership_subscription_invoice') IS NULL THEN
    RAISE EXCEPTION 'membership_subscription_invoice is required before migration 032';
  END IF;
END $$;

-- One provider event must not be represented by multiple evidence rows.  The
-- current evidence model has no separate provider column, so rail + provider
-- reference is the strongest fail-closed identity available.
DO $$
BEGIN
  IF EXISTS (
    SELECT rail,provider_reference
    FROM electronic_payment_evidence
    WHERE provider_reference IS NOT NULL AND length(btrim(provider_reference)) > 0
    GROUP BY rail,provider_reference HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate provider payment references require reconciliation before migration 032';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS electronic_payment_evidence_provider_event_uq
  ON electronic_payment_evidence(rail,provider_reference)
  WHERE provider_reference IS NOT NULL AND length(btrim(provider_reference)) > 0;

CREATE TABLE IF NOT EXISTS electronic_payment_evidence_consumption (
  evidence_id text PRIMARY KEY REFERENCES electronic_payment_evidence(evidence_id),
  consumer_type text NOT NULL CHECK (consumer_type IN ('MEMBERSHIP_SUBSCRIPTION','ITEM_CREDIT_DEPOSIT','ITEM_CREDIT_REPAYMENT')),
  consumer_id text NOT NULL,
  obligation_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GHS'),
  consumed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consumer_type, consumer_id)
);

CREATE TABLE IF NOT EXISTS membership_subscription_settlement_allocation (
  invoice_id text PRIMARY KEY REFERENCES membership_subscription_invoice(invoice_id),
  evidence_id text NOT NULL UNIQUE REFERENCES electronic_payment_evidence(evidence_id),
  membership_id text NOT NULL REFERENCES application_membership(membership_id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GHS'),
  rail text NOT NULL CHECK (rail IN ('MOBILE_MONEY','BANK_TRANSFER','CAGD_PAYROLL')),
  provider_reference text NOT NULL CHECK (length(btrim(provider_reference)) > 0),
  allocated_at timestamptz NOT NULL DEFAULT now()
);

-- Refuse to install a global claim ledger over already contradictory history.
DO $$
BEGIN
  IF EXISTS (
    SELECT evidence_id FROM (
      SELECT deposit_evidence_id AS evidence_id FROM item_credit_receivable WHERE deposit_evidence_id IS NOT NULL
      UNION ALL
      SELECT evidence_id FROM item_credit_repayment_allocation
    ) used GROUP BY evidence_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'payment evidence is already consumed by multiple credit records';
  END IF;
END $$;

INSERT INTO electronic_payment_evidence_consumption(
  evidence_id,consumer_type,consumer_id,obligation_id,amount_minor,currency,consumed_at
)
SELECT r.deposit_evidence_id,'ITEM_CREDIT_DEPOSIT',r.receivable_id,r.receivable_id,
       r.deposit_minor,e.currency,r.created_at
FROM item_credit_receivable r
JOIN electronic_payment_evidence e ON e.evidence_id=r.deposit_evidence_id
WHERE r.deposit_evidence_id IS NOT NULL
ON CONFLICT (evidence_id) DO NOTHING;

INSERT INTO electronic_payment_evidence_consumption(
  evidence_id,consumer_type,consumer_id,obligation_id,amount_minor,currency,consumed_at
)
SELECT a.evidence_id,'ITEM_CREDIT_REPAYMENT',a.allocation_id,a.receivable_id,
       a.amount_minor,e.currency,a.allocated_at
FROM item_credit_repayment_allocation a
JOIN electronic_payment_evidence e ON e.evidence_id=a.evidence_id
ON CONFLICT (evidence_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM item_credit_receivable r
    LEFT JOIN electronic_payment_evidence_consumption c
      ON c.evidence_id=r.deposit_evidence_id
     AND c.consumer_type='ITEM_CREDIT_DEPOSIT' AND c.consumer_id=r.receivable_id
    WHERE r.deposit_evidence_id IS NOT NULL AND c.evidence_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM item_credit_repayment_allocation a
    LEFT JOIN electronic_payment_evidence_consumption c
      ON c.evidence_id=a.evidence_id
     AND c.consumer_type='ITEM_CREDIT_REPAYMENT' AND c.consumer_id=a.allocation_id
    WHERE c.evidence_id IS NULL
  ) THEN
    RAISE EXCEPTION 'existing credit evidence consumption could not be reconciled';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION reject_payment_evidence_rebinding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment evidence binding is immutable';
END $$;

DROP TRIGGER IF EXISTS item_credit_deposit_evidence_immutable_trg ON item_credit_receivable;
CREATE TRIGGER item_credit_deposit_evidence_immutable_trg
BEFORE UPDATE OF deposit_evidence_id ON item_credit_receivable FOR EACH ROW
WHEN (OLD.deposit_evidence_id IS DISTINCT FROM NEW.deposit_evidence_id)
EXECUTE FUNCTION reject_payment_evidence_rebinding();

DROP TRIGGER IF EXISTS item_credit_repayment_evidence_immutable_trg ON item_credit_repayment_allocation;
CREATE TRIGGER item_credit_repayment_evidence_immutable_trg
BEFORE UPDATE OF evidence_id ON item_credit_repayment_allocation FOR EACH ROW
WHEN (OLD.evidence_id IS DISTINCT FROM NEW.evidence_id)
EXECUTE FUNCTION reject_payment_evidence_rebinding();

CREATE OR REPLACE FUNCTION claim_credit_payment_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE evidence_currency text;
BEGIN
  IF TG_TABLE_NAME='item_credit_receivable' THEN
    IF NEW.deposit_evidence_id IS NULL THEN RETURN NEW; END IF;
    SELECT currency INTO evidence_currency FROM electronic_payment_evidence
      WHERE evidence_id=NEW.deposit_evidence_id FOR UPDATE;
    INSERT INTO electronic_payment_evidence_consumption(
      evidence_id,consumer_type,consumer_id,obligation_id,amount_minor,currency
    ) VALUES(NEW.deposit_evidence_id,'ITEM_CREDIT_DEPOSIT',NEW.receivable_id,
             NEW.receivable_id,NEW.deposit_minor,evidence_currency);
  ELSE
    SELECT currency INTO evidence_currency FROM electronic_payment_evidence
      WHERE evidence_id=NEW.evidence_id FOR UPDATE;
    INSERT INTO electronic_payment_evidence_consumption(
      evidence_id,consumer_type,consumer_id,obligation_id,amount_minor,currency
    ) VALUES(NEW.evidence_id,'ITEM_CREDIT_REPAYMENT',NEW.allocation_id,
             NEW.receivable_id,NEW.amount_minor,evidence_currency);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS item_credit_deposit_evidence_claim_trg ON item_credit_receivable;
CREATE TRIGGER item_credit_deposit_evidence_claim_trg
BEFORE INSERT ON item_credit_receivable FOR EACH ROW
EXECUTE FUNCTION claim_credit_payment_evidence();

DROP TRIGGER IF EXISTS item_credit_repayment_evidence_claim_trg ON item_credit_repayment_allocation;
CREATE TRIGGER item_credit_repayment_evidence_claim_trg
BEFORE INSERT ON item_credit_repayment_allocation FOR EACH ROW
EXECUTE FUNCTION claim_credit_payment_evidence();

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

  IF inv.state<>'OPEN'
     OR NOT (mem.state='INACTIVE' AND mem.standing='INITIAL_FEE_DUE') THEN RETURN; END IF;

  SELECT * INTO ev FROM electronic_payment_evidence
    WHERE evidence_id=requested_evidence_id FOR UPDATE;
  IF NOT FOUND OR ev.state<>'RECONCILED' OR ev.reconciled_at IS NULL
     OR ev.membership_id<>inv.membership_id OR ev.obligation_id<>inv.invoice_id
     OR ev.amount_minor<>inv.amount_minor OR ev.currency<>inv.currency
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

  UPDATE application_membership AS target SET state='ACTIVE',standing='ACTIVE',
    activated_at=COALESCE(target.activated_at,settled_at),suspended_at=NULL
    WHERE target.membership_id=mem.membership_id
      AND target.state='INACTIVE' AND target.standing='INITIAL_FEE_DUE';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'subscription membership transition lost'; END IF;

  INSERT INTO application_access_audit(
    audit_id,participant_id,membership_id,event_type,state,outcome,request_id,occurred_at
  ) VALUES(requested_audit_id,mem.participant_id,mem.membership_id,
           'MEMBERSHIP_SUBSCRIPTION_SETTLED','ACTIVE','TRANSITION',requested_request_id,settled_at);

  membership_id:=mem.membership_id; public_member_id:=mem.public_member_id;
  membership_state:='ACTIVE'; standing:='ACTIVE'; idempotent:=false;
  RETURN NEXT;
END $$;
