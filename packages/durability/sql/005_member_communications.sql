CREATE TABLE IF NOT EXISTS member_communication_preferences (
  member_id text PRIMARY KEY,
  transactional_channels text[] NOT NULL,
  promotional_opt_in boolean NOT NULL DEFAULT false,
  promotional_channels text[] NOT NULL,
  suppressed_channels text[] NOT NULL DEFAULT '{}',
  consent_version integer NOT NULL,
  consent_updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS member_communication_consent_event (
  id bigserial PRIMARY KEY,
  member_id text NOT NULL,
  consent_version integer NOT NULL,
  promotional_opt_in boolean NOT NULL,
  transactional_channels text[] NOT NULL,
  promotional_channels text[] NOT NULL,
  suppressed_channels text[] NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE(member_id, consent_version)
);

CREATE TABLE IF NOT EXISTS communication_outbox (
  id text PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  event_id text NOT NULL,
  member_id text NOT NULL,
  subject_id text NOT NULL,
  event_type text NOT NULL,
  communication_class text NOT NULL CHECK (communication_class IN ('TRANSACTIONAL','PROMOTIONAL')),
  template_id text NOT NULL,
  template_version integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('IN_APP','EMAIL','SMS','WHATSAPP')),
  rendered_subject text NOT NULL,
  rendered_body text NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','SUPPRESSED')),
  queued_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  retry_count integer NOT NULL DEFAULT 0,
  failure_reason text,
  lease_owner text,
  lease_until timestamptz
);

CREATE INDEX IF NOT EXISTS communication_outbox_dispatch_idx
  ON communication_outbox(status, available_at, queued_at)
  WHERE status IN ('QUEUED','FAILED');

CREATE INDEX IF NOT EXISTS communication_outbox_member_idx
  ON communication_outbox(member_id, queued_at DESC);
