-- Wave 2 / A8 / ENG-001
-- Product-request survey responses are engagement evidence only.
-- They MUST NOT create basket, commitment, obligation, pooled demand, settlement,
-- inventory, fulfillment, or delivery truth.

CREATE TABLE IF NOT EXISTS member_product_request_survey (
  survey_response_id text PRIMARY KEY,
  participant_id text NOT NULL,
  subject text NOT NULL,
  preference_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  economic_classification text NOT NULL DEFAULT 'NON_COMMITMENT'
    CHECK (economic_classification = 'NON_COMMITMENT'),
  idempotency_key text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_product_request_survey_participant_idempotency_uq
    UNIQUE (participant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS member_product_request_survey_participant_idx
  ON member_product_request_survey(participant_id, submitted_at DESC);

COMMENT ON TABLE member_product_request_survey IS
  'UC-14 engagement evidence only; survey interest is explicitly non-commitment and non-authoritative demand.';
COMMENT ON COLUMN member_product_request_survey.economic_classification IS
  'Hard invariant: NON_COMMITMENT. This record cannot qualify pooled demand or create an economic obligation.';
