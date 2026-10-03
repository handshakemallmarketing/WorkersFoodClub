-- Durable idempotency for the Preview-only membership-subscription simulator.
-- This records request binding only. It grants no Production, provider, funds,
-- refund, fulfillment, credit, payroll, or UC-08 authority.

BEGIN;

CREATE TABLE IF NOT EXISTS membership_subscription_sandbox_request (
  request_id text PRIMARY KEY,
  membership_id text NOT NULL REFERENCES application_membership(membership_id),
  invoice_id text NOT NULL REFERENCES membership_subscription_invoice(invoice_id),
  rail text NOT NULL CHECK (rail IN ('MOBILE_MONEY','BANK_TRANSFER','CAGD_PAYROLL')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency='GHS'),
  evidence_id text NOT NULL UNIQUE
    REFERENCES electronic_payment_evidence(evidence_id) DEFERRABLE INITIALLY DEFERRED,
  provider_reference text NOT NULL UNIQUE CHECK (length(btrim(provider_reference)) > 0),
  audit_id text NOT NULL UNIQUE
    REFERENCES application_access_audit(audit_id) DEFERRABLE INITIALLY DEFERRED,
  state text NOT NULL DEFAULT 'PENDING',
  result_public_member_id text,
  result_membership_state text,
  result_standing text,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT membership_subscription_sandbox_request_state_ck CHECK (
    (state='PENDING' AND completed_at IS NULL
      AND result_public_member_id IS NULL AND result_membership_state IS NULL
      AND result_standing IS NULL)
    OR
    (state='COMMITTED' AND completed_at IS NOT NULL
      AND result_public_member_id IS NOT NULL AND result_membership_state IS NOT NULL
      AND result_standing IS NOT NULL)
  ),
  CONSTRAINT membership_subscription_sandbox_request_completion_ck
    CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- Migration 039 existed only on this unmerged execution branch, but replaying
-- it over an earlier branch rehearsal must still install the exact UUID
-- contract rather than retaining the earlier length-only auto constraint.
ALTER TABLE membership_subscription_sandbox_request
  DROP CONSTRAINT IF EXISTS membership_subscription_sandbox_request_request_id_check;
ALTER TABLE membership_subscription_sandbox_request
  DROP CONSTRAINT IF EXISTS membership_subscription_sandbox_request_request_id_ck;
ALTER TABLE membership_subscription_sandbox_request
  ADD CONSTRAINT membership_subscription_sandbox_request_request_id_ck CHECK (
    request_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

CREATE INDEX IF NOT EXISTS membership_subscription_sandbox_request_invoice_idx
  ON membership_subscription_sandbox_request(invoice_id, membership_id);

CREATE OR REPLACE FUNCTION enforce_subscription_sandbox_request_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'PENDING' THEN
      RAISE EXCEPTION 'subscription sandbox request must begin pending';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='DELETE' THEN
    IF OLD.state='COMMITTED' THEN
      RAISE EXCEPTION 'committed subscription sandbox request is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.rail IS DISTINCT FROM OLD.rail
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.evidence_id IS DISTINCT FROM OLD.evidence_id
     OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.audit_id IS DISTINCT FROM OLD.audit_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'subscription sandbox request binding is immutable';
  END IF;

  IF OLD.state='COMMITTED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'committed subscription sandbox request is immutable';
  END IF;

  IF NEW.state='COMMITTED' AND NOT EXISTS (
    SELECT 1
    FROM membership_subscription_invoice i
    JOIN electronic_payment_evidence e
      ON e.evidence_id=NEW.evidence_id
     AND e.membership_id=NEW.membership_id
     AND e.obligation_id=NEW.invoice_id
     AND e.rail=NEW.rail
     AND e.state='RECONCILED'
     AND e.amount_minor=NEW.amount_minor
     AND e.currency=NEW.currency
     AND e.provider_reference=NEW.provider_reference
     AND e.reconciled_at IS NOT NULL
     AND e.reconciled_at=NEW.created_at
    JOIN membership_subscription_settlement_allocation a
      ON a.invoice_id=NEW.invoice_id
     AND a.evidence_id=NEW.evidence_id
     AND a.membership_id=NEW.membership_id
     AND a.amount_minor=NEW.amount_minor
     AND a.currency=NEW.currency
     AND a.rail=NEW.rail
     AND a.provider_reference=NEW.provider_reference
     AND a.allocated_at=NEW.completed_at
    JOIN electronic_payment_evidence_consumption c
      ON c.evidence_id=NEW.evidence_id
     AND c.consumer_type='MEMBERSHIP_SUBSCRIPTION'
     AND c.consumer_id=NEW.invoice_id
     AND c.obligation_id=NEW.invoice_id
     AND c.amount_minor=NEW.amount_minor
     AND c.currency=NEW.currency
     AND c.consumed_at=NEW.completed_at
    JOIN application_membership m
      ON m.membership_id=NEW.membership_id
     AND m.public_member_id=NEW.result_public_member_id
     AND m.state=NEW.result_membership_state
     AND m.standing=NEW.result_standing
    JOIN application_access_audit au
      ON au.audit_id=NEW.audit_id
     AND au.participant_id=m.participant_id
     AND au.membership_id=NEW.membership_id
     AND au.event_type IN ('MEMBERSHIP_SUBSCRIPTION_SETTLED','MEMBERSHIP_RENEWAL_SETTLED')
     AND au.state='ACTIVE'
     AND au.outcome='TRANSITION'
     AND au.request_id=NEW.request_id
     AND au.occurred_at=NEW.completed_at
    WHERE i.invoice_id=NEW.invoice_id
      AND i.membership_id=NEW.membership_id
      AND i.amount_minor=NEW.amount_minor
      AND i.currency=NEW.currency
      AND i.state='PAID'
      AND i.settlement_evidence_id=NEW.evidence_id
      AND i.paid_at=NEW.completed_at
      AND NEW.completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'committed subscription sandbox request lineage is invalid';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS committed_subscription_sandbox_request_immutable_trg
  ON membership_subscription_sandbox_request;
DROP TRIGGER IF EXISTS subscription_sandbox_request_transition_trg
  ON membership_subscription_sandbox_request;
CREATE TRIGGER subscription_sandbox_request_transition_trg
BEFORE INSERT OR UPDATE OR DELETE ON membership_subscription_sandbox_request
FOR EACH ROW EXECUTE FUNCTION enforce_subscription_sandbox_request_transition();

CREATE OR REPLACE FUNCTION reject_committed_sandbox_request_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM membership_subscription_sandbox_request r
    WHERE r.audit_id=OLD.audit_id AND r.state='COMMITTED'
  ) THEN
    RAISE EXCEPTION 'committed subscription sandbox audit is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS committed_sandbox_request_audit_immutable_trg
  ON application_access_audit;
CREATE TRIGGER committed_sandbox_request_audit_immutable_trg
BEFORE UPDATE OR DELETE ON application_access_audit
FOR EACH ROW EXECUTE FUNCTION reject_committed_sandbox_request_audit_mutation();

COMMIT;
