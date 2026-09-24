-- Renewal settlement was a dead end. settle_membership_subscription (032)
-- only recognized the very first invoice (state='INACTIVE' AND
-- standing='INITIAL_FEE_DUE'); paying a later annual renewal invoice while a
-- membership sat in GRACE or RESTRICTED standing silently matched neither
-- branch and returned no row (SUBSCRIPTION_SETTLEMENT_NOT_APPLICABLE at the
-- API layer), leaving the member restricted forever even after paying.
-- Discovered while wiring the renewal cron (which drives ACTIVE -> GRACE ->
-- RESTRICTED on an unpaid renewal invoice per the pre-existing 30-day grace
-- window columns/constraint from migration 027/029) — a job that can move a
-- member into RESTRICTED needs a working path back out.
--
-- This migration only adds a second, narrower recognized precondition
-- (state='ACTIVE' AND standing IN ('GRACE','RESTRICTED')) that restores
-- standing='ACTIVE' and clears the grace window. It never touches the
-- original initial-settlement branch or its own precondition.

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
