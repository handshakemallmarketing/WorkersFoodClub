ALTER TABLE durable_command_execution
  ADD COLUMN IF NOT EXISTS fence_generation bigint NOT NULL DEFAULT 1;

ALTER TABLE durable_command_execution
  DROP CONSTRAINT IF EXISTS durable_command_execution_fence_positive;
ALTER TABLE durable_command_execution
  ADD CONSTRAINT durable_command_execution_fence_positive CHECK (fence_generation > 0);

CREATE INDEX IF NOT EXISTS durable_command_execution_owner_fence_idx
  ON durable_command_execution(idempotency_key, owner_token, fence_generation)
  WHERE state = 'IN_FLIGHT';
