-- Durable idempotency for the Preview-only membership-subscription simulator.
-- This records request binding only. It grants no Production, provider, funds,
-- refund, fulfillment, credit, payroll, or UC-08 authority.

BEGIN;

CREATE TABLE IF NOT EXISTS membership_subscription_sandbox_request (
  request_id text PRIMARY KEY CHECK (length(request_id) BETWEEN 8 AND 128),
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

CREATE INDEX IF NOT EXISTS membership_subscription_sandbox_request_invoice_idx
  ON membership_subscription_sandbox_request(invoice_id, membership_id);

CREATE OR REPLACE FUNCTION reject_committed_subscription_sandbox_request_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='COMMITTED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'committed subscription sandbox request is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS committed_subscription_sandbox_request_immutable_trg
  ON membership_subscription_sandbox_request;
CREATE TRIGGER committed_subscription_sandbox_request_immutable_trg
BEFORE UPDATE OR DELETE ON membership_subscription_sandbox_request
FOR EACH ROW EXECUTE FUNCTION reject_committed_subscription_sandbox_request_mutation();

COMMIT;
