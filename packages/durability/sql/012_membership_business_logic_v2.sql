BEGIN;

CREATE TABLE IF NOT EXISTS member_application (
  application_id text PRIMARY KEY,
  legal_name text NOT NULL CHECK (btrim(legal_name) <> ''),
  primary_contact text NOT NULL CHECK (btrim(primary_contact) <> ''),
  eligibility_class text NOT NULL CHECK (btrim(eligibility_class) <> ''),
  eligibility_evidence_ids jsonb NOT NULL CHECK (jsonb_typeof(eligibility_evidence_ids) = 'array'),
  communication_consent boolean NOT NULL DEFAULT false,
  state text NOT NULL CHECK (state IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','WITHDRAWN')),
  created_at timestamptz NOT NULL,
  submitted_at timestamptz,
  eligibility_decision_id text,
  CHECK (state <> 'APPROVED' OR eligibility_decision_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS beneficiary_invitation (
  invitation_id text PRIMARY KEY,
  sponsor_participant_id text NOT NULL REFERENCES participant(participant_id),
  beneficiary_participant_id text REFERENCES participant(participant_id),
  token_digest text NOT NULL CHECK (btrim(token_digest) <> ''),
  state text NOT NULL CHECK (state IN ('INVITED','ACCEPTED','ACTIVATED','REVOKED','EXPIRED')),
  invited_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  activated_at timestamptz,
  CHECK (expires_at > invited_at),
  CHECK (state NOT IN ('ACCEPTED','ACTIVATED') OR beneficiary_participant_id IS NOT NULL),
  CHECK (state <> 'ACTIVATED' OR activated_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficiary_invitation_token_digest_uq ON beneficiary_invitation(token_digest);
CREATE INDEX IF NOT EXISTS beneficiary_invitation_sponsor_state_idx ON beneficiary_invitation(sponsor_participant_id,state);

CREATE TABLE IF NOT EXISTS membership_invoice (
  invoice_id text PRIMARY KEY,
  participant_id text NOT NULL REFERENCES participant(participant_id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  settled_minor bigint NOT NULL DEFAULT 0 CHECK (settled_minor >= 0 AND settled_minor <= amount_minor),
  state text NOT NULL CHECK (state IN ('ISSUED','DUE','PARTIALLY_SETTLED','SETTLED','PAST_DUE','VOID')),
  issued_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  CHECK (due_at >= issued_at),
  CHECK (state <> 'SETTLED' OR settled_minor = amount_minor),
  CHECK (state <> 'VOID' OR settled_minor = 0)
);
CREATE INDEX IF NOT EXISTS membership_invoice_participant_state_idx ON membership_invoice(participant_id,state);

CREATE TABLE IF NOT EXISTS membership_invoice_settlement (
  settlement_reference text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES membership_invoice(invoice_id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_invoice_settlement_invoice_idx ON membership_invoice_settlement(invoice_id);

COMMIT;
