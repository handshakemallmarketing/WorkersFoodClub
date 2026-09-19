CREATE TABLE IF NOT EXISTS promotion_compliance_evidence (
  evidence_id text PRIMARY KEY,
  promotion_id text NOT NULL REFERENCES promotion_campaign(promotion_id) ON DELETE RESTRICT,
  evidence_type text NOT NULL CHECK (evidence_type IN ('RAFFLE_LEGAL_REVIEW','RAFFLE_RULES_APPROVAL','OTHER')),
  reference text NOT NULL CHECK (length(trim(reference)) > 0),
  state text NOT NULL DEFAULT 'VALID' CHECK (state IN ('VALID','REVOKED')),
  recorded_by text NOT NULL CHECK (length(trim(recorded_by)) > 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (promotion_id,evidence_type,reference)
);
CREATE INDEX IF NOT EXISTS promotion_compliance_evidence_promotion_idx ON promotion_compliance_evidence(promotion_id,state,evidence_type);
