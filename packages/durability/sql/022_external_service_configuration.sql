-- Configuration metadata only. Raw provider secrets MUST NOT be persisted in PostgreSQL.
CREATE TABLE IF NOT EXISTS external_service_configuration (
 service_id text PRIMARY KEY,
 provider text NOT NULL,
 state text NOT NULL DEFAULT 'DISABLED' CHECK(state IN('DISABLED','CONFIGURED','ACTIVE','ERROR')),
 credential_fingerprint text,
 credential_fields text[] NOT NULL DEFAULT '{}',
 last_test_state text CHECK(last_test_state IS NULL OR last_test_state IN('PASS','FAIL')),
 last_tested_at timestamptz,
 activated_at timestamptz,
 activated_by text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS external_service_configuration_event (
 event_id text PRIMARY KEY,
 service_id text NOT NULL,
 event_type text NOT NULL,
 actor_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE external_service_configuration IS 'Non-secret runtime integration state. Provider secrets remain in the deployment secret store.';
