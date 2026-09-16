BEGIN;

CREATE TABLE IF NOT EXISTS membership_shopping_credit_lot (
  id text PRIMARY KEY,
  participant_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('MEMBERSHIP_FEE_SPENDING_CREDIT','PROMOTIONAL_CREDIT','MEMBERSHIP_OVERPAYMENT_CREDIT')),
  funding text NOT NULL CHECK (funding IN ('MEMBER_FUNDED','CLUB_FUNDED')),
  issued_minor bigint NOT NULL CHECK (issued_minor > 0),
  available_minor bigint NOT NULL CHECK (available_minor >= 0 AND available_minor <= issued_minor),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz,
  source_reference text NOT NULL UNIQUE,
  campaign_reference text,
  state text NOT NULL CHECK (state IN ('AVAILABLE','RESERVED','REDEEMED','EXPIRED')),
  CHECK (expires_at IS NULL OR expires_at > issued_at),
  CHECK (source <> 'PROMOTIONAL_CREDIT' OR campaign_reference IS NOT NULL),
  CHECK (source <> 'MEMBERSHIP_OVERPAYMENT_CREDIT' OR funding = 'MEMBER_FUNDED'),
  CHECK (source = 'MEMBERSHIP_OVERPAYMENT_CREDIT' OR funding = 'CLUB_FUNDED')
);

CREATE TABLE IF NOT EXISTS membership_shopping_credit_entry (
  id text PRIMARY KEY,
  lot_id text NOT NULL REFERENCES membership_shopping_credit_lot(id),
  participant_id text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('ISSUANCE','RESERVATION','REDEMPTION','RELEASE','EXPIRATION','REVERSAL','ADJUSTMENT')),
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
  occurred_at timestamptz NOT NULL,
  source_reference text NOT NULL UNIQUE,
  related_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS membership_shopping_credit_lot_participant_idx
  ON membership_shopping_credit_lot(participant_id, state, source);
CREATE INDEX IF NOT EXISTS membership_shopping_credit_entry_lot_idx
  ON membership_shopping_credit_entry(lot_id, occurred_at);
CREATE INDEX IF NOT EXISTS membership_shopping_credit_entry_participant_idx
  ON membership_shopping_credit_entry(participant_id, occurred_at);

COMMIT;
