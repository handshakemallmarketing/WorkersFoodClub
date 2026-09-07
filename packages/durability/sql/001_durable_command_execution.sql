CREATE TABLE IF NOT EXISTS durable_command_execution (
  idempotency_key text PRIMARY KEY,
  command_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('IN_FLIGHT','COMMITTED')),
  owner_token text NOT NULL,
  lease_until timestamptz NOT NULL,
  result_json jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((state = 'IN_FLIGHT' AND result_json IS NULL) OR (state = 'COMMITTED' AND result_json IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS durable_command_execution_command_id_uq
  ON durable_command_execution(command_id);

CREATE INDEX IF NOT EXISTS durable_command_execution_inflight_lease_idx
  ON durable_command_execution(lease_until)
  WHERE state = 'IN_FLIGHT';
