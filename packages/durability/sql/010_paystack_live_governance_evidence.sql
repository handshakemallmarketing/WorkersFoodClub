CREATE TABLE IF NOT EXISTS paystack_live_authorization_evidence (
  authorization_id text PRIMARY KEY,
  action text NOT NULL CHECK (action = 'EnablePaystackLiveBoundedTransaction'),
  environment text NOT NULL CHECK (environment = 'production'),
  status text NOT NULL CHECK (status IN ('ACTIVE','RESERVED','CLAIMED','REVOKED')),
  revoked_at timestamptz NULL,
  reservation_id text NULL UNIQUE,
  candidate_sha text NOT NULL CHECK (candidate_sha ~ '^[A-Fa-f0-9]{40}$'),
  merchant_account_id text NOT NULL,
  authorization_expires_at timestamptz NOT NULL,
  live_funds_authorized boolean NOT NULL CHECK (live_funds_authorized = true),
  paystack_live_mode_authorized boolean NOT NULL CHECK (paystack_live_mode_authorized = true),
  approved_reference text NOT NULL,
  approved_actor_id text NOT NULL,
  approved_amount_minor numeric(30,0) NOT NULL CHECK (approved_amount_minor > 0),
  approved_currency text NOT NULL CHECK (approved_currency = 'GHS'),
  authorized_by text NOT NULL,
  authorization_basis text NOT NULL,
  reserved_at timestamptz NULL,
  claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'ACTIVE' AND reservation_id IS NULL AND reserved_at IS NULL AND claimed_at IS NULL)
      OR (status = 'RESERVED' AND reservation_id IS NOT NULL AND reserved_at IS NOT NULL AND claimed_at IS NULL)
      OR (status = 'CLAIMED' AND reservation_id IS NOT NULL AND reserved_at IS NOT NULL AND claimed_at IS NOT NULL)
      OR (status = 'REVOKED' AND revoked_at IS NOT NULL)),
  CHECK (authorization_expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS paystack_live_authorization_candidate_merchant_idx
  ON paystack_live_authorization_evidence(candidate_sha, merchant_account_id, status);

CREATE TABLE IF NOT EXISTS paystack_live_watchdog_evidence (
  watchdog_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('ARMED','EXPIRED','DISARMED','FAILED')),
  candidate_sha text NOT NULL CHECK (candidate_sha ~ '^[A-Fa-f0-9]{40}$'),
  merchant_account_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  executor_class text NOT NULL CHECK (executor_class = 'INDEPENDENT_WATCHDOG'),
  containment_action text NOT NULL CHECK (containment_action = 'DISABLE_PAYSTACK_LIVE'),
  activating_runner_independent boolean NOT NULL CHECK (activating_runner_independent = true),
  evidence_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS paystack_live_one_armed_watchdog_per_binding_idx
  ON paystack_live_watchdog_evidence(candidate_sha, merchant_account_id)
  WHERE status = 'ARMED';
