-- J24 T-24 fulfillment planning boundary.
-- The deadline processor records what must happen operationally without pretending
-- that warehouse readiness has already been performed by a human operator.
CREATE TABLE IF NOT EXISTS preview_deadline_fulfillment_plan (
  plan_id text PRIMARY KEY,
  obligation_id text NOT NULL REFERENCES preview_member_commitment(obligation_id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN ('RESCHEDULE_REQUIRED','READY_TO_FULFILL')),
  planned_quantity numeric NOT NULL CHECK (planned_quantity > 0),
  released_quantity numeric NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  unit text NOT NULL CHECK (length(trim(unit)) > 0),
  source_tier text NOT NULL CHECK (source_tier IN ('CURRENT_BATCH_RESCHEDULE','PRORATED_FULFILLMENT','FULLY_PAID')),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','SCHEDULED','CONSUMED','CANCELLED')),
  target_delivery_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id)
);
CREATE INDEX IF NOT EXISTS preview_deadline_fulfillment_plan_state_idx
  ON preview_deadline_fulfillment_plan(state, disposition, created_at);
COMMENT ON TABLE preview_deadline_fulfillment_plan IS
  'Durable T-24 handoff. RESCHEDULE_REQUIRED awaits an operator-selected future batch; READY_TO_FULFILL awaits normal fulfillment readiness processing.';
