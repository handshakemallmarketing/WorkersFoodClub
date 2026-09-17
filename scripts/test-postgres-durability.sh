#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/foodclub_test}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)
for migration in 001_durable_command_execution.sql 002_canonical_event_store.sql 003_command_fencing.sql 004_physical_lineage.sql 005_member_communications.sql 006_application_identity_binding.sql 007_application_authority_membership.sql 008_identity_binding_referential_integrity.sql 009_preview_runtime_schema.sql 011_preview_runtime_timestamp_defaults.sql 012_membership_business_logic_v2.sql 013_membership_shopping_credit_accounting.sql 014_wave2_support_case.sql; do
  "${PSQL[@]}" -f "packages/durability/sql/$migration"
done
support_tables=$("${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('support_case','support_case_transition')")
[[ "$support_tables" == "2" ]] || { echo "A10 support schema is not reproducible from migrations" >&2; exit 1; }
"${PSQL[@]}" <<'SQL'
TRUNCATE support_case_transition,support_case,membership_shopping_credit_entry,membership_shopping_credit_lot,membership_invoice_settlement,membership_invoice,beneficiary_invitation,member_application,application_identity_binding,application_membership,application_authority_grant,application_participant,communication_outbox,member_communication_consent_event,member_communication_preferences,lineage_transform_output,lineage_transform_input,lineage_transform,lineage_lot,canonical_event,aggregate_version,durable_command_execution RESTART IDENTITY;
SQL
"${PSQL[@]}" <<'SQL'
INSERT INTO application_participant(participant_id,kind,state) VALUES ('participant:member','PERSON','ACTIVE'),('participant:operator','PERSON','ACTIVE');
INSERT INTO support_case(case_id,participant_id,subject_type,subject_id,category,reason_code,created_by_actor_id,created_by_authn_subject_ref,updated_by_actor_id,updated_by_authn_subject_ref,command_idempotency_key) VALUES('case:harness','participant:member','ORDER','order:1','DELIVERY','LATE','participant:operator','preview-auth:harness','participant:operator','preview-auth:harness','11111111-1111-4111-8111-111111111111');
SQL
case_state=$("${PSQL[@]}" -Atc "SELECT state||':'||state_version FROM support_case WHERE case_id='case:harness'")
[[ "$case_state" == "OPEN:1" ]] || { echo "A10 support case did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO support_case_transition(transition_id,case_id,from_state,to_state,state_version,actor_id,authn_subject_ref,command_idempotency_key) VALUES('transition:bad','case:harness','OPEN','OPEN',2,'participant:operator','preview-auth:harness','22222222-2222-4222-8222-222222222222')" >/dev/null 2>&1; then echo "A10 same-state transition unexpectedly succeeded" >&2; exit 1; fi
printf '%s\n' 'PostgreSQL durability harness: PASS'
