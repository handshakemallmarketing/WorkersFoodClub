CREATE TABLE IF NOT EXISTS aggregate_version (
  aggregate_id text PRIMARY KEY,
  version bigint NOT NULL CHECK (version >= 0)
);

CREATE TABLE IF NOT EXISTS canonical_event (
  event_id text PRIMARY KEY,
  aggregate_id text NOT NULL,
  aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_id, aggregate_version)
);

CREATE INDEX IF NOT EXISTS canonical_event_aggregate_idx
  ON canonical_event(aggregate_id, aggregate_version);
