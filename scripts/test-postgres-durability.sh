#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/foodclub_test}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -f packages/durability/sql/001_durable_command_execution.sql
"${PSQL[@]}" -f packages/durability/sql/002_canonical_event_store.sql
"${PSQL[@]}" -f packages/durability/sql/003_command_fencing.sql
"${PSQL[@]}" -f packages/durability/sql/004_physical_lineage.sql
"${PSQL[@]}" -f packages/durability/sql/005_member_communications.sql
"${PSQL[@]}" -f packages/durability/sql/006_application_identity_binding.sql
"${PSQL[@]}" -f packages/durability/sql/007_application_authority_membership.sql
"${PSQL[@]}" -f packages/durability/sql/008_identity_binding_referential_integrity.sql
"${PSQL[@]}" -f packages/durability/sql/009_preview_runtime_schema.sql
"${PSQL[@]}" -f packages/durability/sql/011_preview_runtime_timestamp_defaults.sql
"${PSQL[@]}" -f packages/durability/sql/012_membership_business_logic_v2.sql

preview_runtime_tables=$("${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('preview_member_offer','preview_member_commitment','preview_fulfillment','preview_fulfillment_exception','preview_sandbox_payment','preview_refund_remedy','preview_health')")
[[ "$preview_runtime_tables" == "7" ]] || { echo "preview runtime schema is not reproducible from migrations" >&2; exit 1; }

a2_membership_tables=$("${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('member_application','beneficiary_invitation','membership_invoice','membership_invoice_settlement')")
[[ "$a2_membership_tables" == "4" ]] || { echo "A2 membership schema is not reproducible from migrations" >&2; exit 1; }

accepted_at_contract=$("${PSQL[@]}" -Atc "SELECT is_nullable||':'||COALESCE(column_default,'') FROM information_schema.columns WHERE table_schema='public' AND table_name='preview_member_commitment' AND column_name='accepted_at'")
[[ "$accepted_at_contract" == NO:* && "$accepted_at_contract" != "NO:" ]] || { echo "preview_member_commitment.accepted_at must remain NOT NULL with a database default" >&2; exit 1; }

recorded_at_contract=$("${PSQL[@]}" -Atc "SELECT is_nullable||':'||COALESCE(column_default,'') FROM information_schema.columns WHERE table_schema='public' AND table_name='preview_sandbox_payment' AND column_name='recorded_at'")
[[ "$recorded_at_contract" == NO:* && "$recorded_at_contract" != "NO:" ]] || { echo "preview_sandbox_payment.recorded_at must remain NOT NULL with a database default" >&2; exit 1; }
refund_unique_constraints=$("${PSQL[@]}" -Atc "SELECT count(*) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='preview_refund_remedy' AND con.contype='u' AND con.conname IN ('preview_refund_remedy_source_exception_id_key','preview_refund_remedy_authorize_request_id_key','preview_refund_remedy_authorize_command_id_key','preview_refund_remedy_authorize_event_id_key','preview_refund_remedy_complete_request_id_key','preview_refund_remedy_complete_command_id_key','preview_refund_remedy_completion_event_id_key','preview_refund_remedy_provider_reference_key')")
[[ "$refund_unique_constraints" == "8" ]] || { echo "preview refund idempotency constraints are incomplete" >&2; exit 1; }

"${PSQL[@]}" <<'SQL'
TRUNCATE membership_invoice_settlement,membership_invoice,beneficiary_invitation,member_application,application_identity_binding,application_membership,application_authority_grant,application_participant,communication_outbox,member_communication_consent_event,member_communication_preferences,lineage_transform_output,lineage_transform_input,lineage_transform,lineage_lot,canonical_event,aggregate_version,durable_command_execution RESTART IDENTITY;
SQL

# RC3-BIND-001: durable participant, membership and operator authority are independent governed records.
"${PSQL[@]}" <<'SQL'
INSERT INTO application_participant(participant_id,kind,state)
VALUES
 ('participant:member','PERSON','ACTIVE'),
 ('participant:operator','PERSON','ACTIVE'),
 ('participant:system','SYSTEM','ACTIVE');

INSERT INTO application_membership(membership_id,participant_id,state,established_at,eligibility_policy_version,eligibility_evidence_ids)
VALUES('membership:live','participant:member','ACTIVE',now(),'founding-worker-v1',ARRAY['evidence:eligibility:1']);

INSERT INTO application_authority_grant(grant_id,grantor_id,actor_id,actions,valid_from)
VALUES('grant:operator:orders','participant:system','participant:operator',ARRAY['operator:orders.read'],now()-interval '1 minute');
SQL
participant=$("${PSQL[@]}" -Atc "SELECT participant_id||':'||state FROM application_participant WHERE participant_id='participant:member'")
[[ "$participant" == "participant:member:ACTIVE" ]] || { echo "application participant did not survive connection boundary" >&2; exit 1; }
membership=$("${PSQL[@]}" -Atc "SELECT membership_id||':'||state FROM application_membership WHERE participant_id='participant:member'")
[[ "$membership" == "membership:live:ACTIVE" ]] || { echo "active membership did not survive connection boundary" >&2; exit 1; }
authority=$("${PSQL[@]}" -Atc "SELECT grant_id FROM application_authority_grant WHERE actor_id='participant:operator' AND 'operator:orders.read'=ANY(actions) AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) AND (revoked_at IS NULL OR revoked_at>now())")
[[ "$authority" == "grant:operator:orders" ]] || { echo "operator authority did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO application_membership(membership_id,participant_id,state,established_at,eligibility_policy_version,eligibility_evidence_ids) VALUES('membership:duplicate','participant:member','ACTIVE',now(),'founding-worker-v1',ARRAY['evidence:eligibility:2'])" >/dev/null 2>&1; then
  echo "second ACTIVE membership unexpectedly succeeded" >&2; exit 1
fi

# A2 durable membership falsification: FK integrity, slot-concurrency primitive, and settlement replay.
"${PSQL[@]}" <<'SQL'
INSERT INTO member_application(application_id,legal_name,primary_contact,eligibility_class,eligibility_evidence_ids,communication_consent,state,created_at)
VALUES('application:a2','A2 Member','member@example.test','PUBLIC_SECTOR','["evidence:a2"]'::jsonb,true,'DRAFT',now());

INSERT INTO beneficiary_invitation(invitation_id,sponsor_participant_id,token_digest,state,invited_at,expires_at)
VALUES('beneficiary:a2-1','participant:member','digest:a2-1','INVITED',now(),now()+interval '1 day');

INSERT INTO membership_invoice(invoice_id,participant_id,amount_minor,state,issued_at,due_at)
VALUES('invoice:a2','participant:member',10000,'PAST_DUE',now()-interval '20 days',now()-interval '10 days');
INSERT INTO membership_invoice_settlement(settlement_reference,invoice_id,amount_minor)
VALUES('settlement:a2-1','invoice:a2',4000);
SQL

if "${PSQL[@]}" -c "INSERT INTO membership_invoice_settlement(settlement_reference,invoice_id,amount_minor) VALUES('settlement:a2-1','invoice:a2',4000)" >/dev/null 2>&1; then
  echo "A2 settlement replay unexpectedly succeeded" >&2; exit 1
fi
if "${PSQL[@]}" -c "INSERT INTO beneficiary_invitation(invitation_id,sponsor_participant_id,token_digest,state,invited_at,expires_at) VALUES('beneficiary:a2-bad','participant:missing','digest:a2-bad','INVITED',now(),now()+interval '1 day')" >/dev/null 2>&1; then
  echo "A2 beneficiary sponsor FK bypass unexpectedly succeeded" >&2; exit 1
fi

# Existing durability tests continue below.
