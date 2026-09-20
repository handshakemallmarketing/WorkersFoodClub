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
"${PSQL[@]}" -f packages/durability/sql/013_membership_shopping_credit_accounting.sql
"${PSQL[@]}" -f packages/durability/sql/014_wave2_support_case.sql
"${PSQL[@]}" -f packages/durability/sql/027_catalog_administration_v1.sql

preview_runtime_tables=$("${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('preview_member_offer','preview_member_commitment','preview_fulfillment','preview_fulfillment_exception','preview_sandbox_payment','preview_refund_remedy','preview_health')")
[[ "$preview_runtime_tables" == "7" ]] || { echo "preview runtime schema is not reproducible from migrations" >&2; exit 1; }
a2_membership_tables=$("${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('member_application','beneficiary_invitation','membership_invoice','membership_invoice_settlement')")
[[ "$a2_membership_tables" == "4" ]] || { echo "A2 membership schema is not reproducible from migrations" >&2; exit 1; }
a2_credit_tables=$("${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('membership_shopping_credit_lot','membership_shopping_credit_entry')")
[[ "$a2_credit_tables" == "2" ]] || { echo "A2 shopping-credit schema is not reproducible from migrations" >&2; exit 1; }
a10_support_tables=$("${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('support_case','support_case_transition')")
[[ "$a10_support_tables" == "2" ]] || { echo "A10 support schema is not reproducible from migrations" >&2; exit 1; }
accepted_at_contract=$("${PSQL[@]}" -Atc "SELECT is_nullable||':'||COALESCE(column_default,'') FROM information_schema.columns WHERE table_schema='public' AND table_name='preview_member_commitment' AND column_name='accepted_at'")
[[ "$accepted_at_contract" == NO:* && "$accepted_at_contract" != "NO:" ]] || { echo "preview_member_commitment.accepted_at must remain NOT NULL with a database default" >&2; exit 1; }
recorded_at_contract=$("${PSQL[@]}" -Atc "SELECT is_nullable||':'||COALESCE(column_default,'') FROM information_schema.columns WHERE table_schema='public' AND table_name='preview_sandbox_payment' AND column_name='recorded_at'")
[[ "$recorded_at_contract" == NO:* && "$recorded_at_contract" != "NO:" ]] || { echo "preview_sandbox_payment.recorded_at must remain NOT NULL with a database default" >&2; exit 1; }
refund_unique_constraints=$("${PSQL[@]}" -Atc "SELECT count(*) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='preview_refund_remedy' AND con.contype='u' AND con.conname IN ('preview_refund_remedy_source_exception_id_key','preview_refund_remedy_authorize_request_id_key','preview_refund_remedy_authorize_command_id_key','preview_refund_remedy_authorize_event_id_key','preview_refund_remedy_complete_request_id_key','preview_refund_remedy_complete_command_id_key','preview_refund_remedy_completion_event_id_key','preview_refund_remedy_provider_reference_key')")
[[ "$refund_unique_constraints" == "8" ]] || { echo "preview refund idempotency constraints are incomplete" >&2; exit 1; }

"${PSQL[@]}" <<'SQL'
TRUNCATE support_case_transition,support_case,membership_shopping_credit_entry,membership_shopping_credit_lot,membership_invoice_settlement,membership_invoice,beneficiary_invitation,member_application,application_identity_binding,application_membership,application_authority_grant,application_participant,communication_outbox,member_communication_consent_event,member_communication_preferences,lineage_transform_output,lineage_transform_input,lineage_transform,lineage_lot,canonical_event,aggregate_version,durable_command_execution RESTART IDENTITY;
SQL

# RC3-BIND-001: durable participant, membership and operator authority are independent governed records.
"${PSQL[@]}" <<'SQL'
INSERT INTO application_participant(participant_id,kind,state) VALUES ('participant:member','PERSON','ACTIVE'),('participant:operator','PERSON','ACTIVE'),('participant:system','SYSTEM','ACTIVE');
INSERT INTO application_membership(membership_id,participant_id,state,established_at,eligibility_policy_version,eligibility_evidence_ids) VALUES('membership:live','participant:member','ACTIVE',now(),'founding-worker-v1',ARRAY['evidence:eligibility:1']);
INSERT INTO application_authority_grant(grant_id,grantor_id,actor_id,actions,valid_from) VALUES('grant:operator:orders','participant:system','participant:operator',ARRAY['operator:orders.read'],now()-interval '1 minute');
SQL
participant=$("${PSQL[@]}" -Atc "SELECT participant_id||':'||state FROM application_participant WHERE participant_id='participant:member'")
[[ "$participant" == "participant:member:ACTIVE" ]] || { echo "application participant did not survive connection boundary" >&2; exit 1; }
membership=$("${PSQL[@]}" -Atc "SELECT membership_id||':'||state FROM application_membership WHERE participant_id='participant:member'")
[[ "$membership" == "membership:live:ACTIVE" ]] || { echo "active membership did not survive connection boundary" >&2; exit 1; }
authority=$("${PSQL[@]}" -Atc "SELECT grant_id FROM application_authority_grant WHERE actor_id='participant:operator' AND 'operator:orders.read'=ANY(actions) AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) AND (revoked_at IS NULL OR revoked_at>now())")
[[ "$authority" == "grant:operator:orders" ]] || { echo "operator authority did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO application_membership(membership_id,participant_id,state,established_at,eligibility_policy_version,eligibility_evidence_ids) VALUES('membership:duplicate','participant:member','ACTIVE',now(),'founding-worker-v1',ARRAY['evidence:eligibility:2'])" >/dev/null 2>&1; then echo "second ACTIVE membership unexpectedly succeeded" >&2; exit 1; fi

# A10 durable support lifecycle falsification.
"${PSQL[@]}" <<'SQL'
INSERT INTO support_case(case_id,participant_id,subject_type,subject_id,category,reason_code,created_by_actor_id,created_by_authn_subject_ref,updated_by_actor_id,updated_by_authn_subject_ref,command_idempotency_key)
VALUES('case:a10','participant:member','ORDER','order:a10','DELIVERY','LATE','participant:operator','preview-auth:harness','participant:operator','preview-auth:harness','11111111-1111-4111-8111-111111111111');
INSERT INTO support_case_transition(transition_id,case_id,from_state,to_state,state_version,actor_id,authn_subject_ref,command_idempotency_key)
VALUES('transition:a10-1','case:a10','OPEN','IN_REVIEW',2,'participant:operator','preview-auth:harness','22222222-2222-4222-8222-222222222222');
UPDATE support_case SET state='IN_REVIEW',state_version=2,updated_by_actor_id='participant:operator',updated_by_authn_subject_ref='preview-auth:harness' WHERE case_id='case:a10' AND state_version=1;
SQL
a10_state=$("${PSQL[@]}" -Atc "SELECT state||':'||state_version FROM support_case WHERE case_id='case:a10'")
[[ "$a10_state" == "IN_REVIEW:2" ]] || { echo "A10 support state did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO support_case_transition(transition_id,case_id,from_state,to_state,state_version,actor_id,authn_subject_ref,command_idempotency_key) VALUES('transition:a10-same','case:a10','IN_REVIEW','IN_REVIEW',3,'participant:operator','preview-auth:harness','33333333-3333-4333-8333-333333333333')" >/dev/null 2>&1; then echo "A10 same-state transition unexpectedly succeeded" >&2; exit 1; fi
if "${PSQL[@]}" -c "INSERT INTO support_case_transition(transition_id,case_id,from_state,to_state,state_version,actor_id,authn_subject_ref,command_idempotency_key) VALUES('transition:a10-illegal','case:a10','CLOSED','WAITING',3,'participant:operator','preview-auth:harness','44444444-4444-4444-8444-444444444444')" >/dev/null 2>&1; then echo "A10 illegal CLOSED to WAITING transition unexpectedly succeeded" >&2; exit 1; fi
if "${PSQL[@]}" -c "INSERT INTO support_case(case_id,participant_id,subject_type,subject_id,category,reason_code,created_by_actor_id,created_by_authn_subject_ref,updated_by_actor_id,updated_by_authn_subject_ref,command_idempotency_key) VALUES('case:a10-bad','participant:missing','ORDER','order:bad','DELIVERY','LATE','participant:operator','preview-auth:harness','participant:operator','preview-auth:harness','55555555-5555-4555-8555-555555555555')" >/dev/null 2>&1; then echo "A10 participant lineage FK bypass unexpectedly succeeded" >&2; exit 1; fi

# A2 durable membership and shopping-credit falsification.
"${PSQL[@]}" <<'SQL'
INSERT INTO member_application(application_id,legal_name,primary_contact,eligibility_class,eligibility_evidence_ids,communication_consent,state,created_at) VALUES('application:a2','A2 Member','member@example.test','PUBLIC_SECTOR','["evidence:a2"]'::jsonb,true,'DRAFT',now());
INSERT INTO beneficiary_invitation(invitation_id,sponsor_participant_id,token_digest,state,invited_at,expires_at) VALUES('beneficiary:a2-1','participant:member','digest:a2-1','INVITED',now(),now()+interval '1 day');
INSERT INTO membership_invoice(invoice_id,participant_id,amount_minor,state,issued_at,due_at) VALUES('invoice:a2','participant:member',10000,'PAST_DUE',now()-interval '20 days',now()-interval '10 days');
INSERT INTO membership_invoice_settlement(settlement_reference,invoice_id,amount_minor) VALUES('settlement:a2-1','invoice:a2',4000);
INSERT INTO membership_shopping_credit_lot(id,participant_id,source,funding,applicability,issued_minor,available_minor,issued_at,source_reference,state) VALUES('credit:a2-over','participant:member','SHIPPING_CREDIT','MEMBER_FUNDED','SHIPPING',1000,1000,now(),'membership-overpayment:settlement:a2-over','AVAILABLE');
SQL
if "${PSQL[@]}" -c "INSERT INTO membership_invoice_settlement(settlement_reference,invoice_id,amount_minor) VALUES('settlement:a2-1','invoice:a2',4000)" >/dev/null 2>&1; then echo "A2 settlement replay unexpectedly succeeded" >&2; exit 1; fi
if "${PSQL[@]}" -c "INSERT INTO beneficiary_invitation(invitation_id,sponsor_participant_id,token_digest,state,invited_at,expires_at) VALUES('beneficiary:a2-bad','participant:missing','digest:a2-bad','INVITED',now(),now()+interval '1 day')" >/dev/null 2>&1; then echo "A2 beneficiary sponsor FK bypass unexpectedly succeeded" >&2; exit 1; fi
if "${PSQL[@]}" -c "INSERT INTO membership_shopping_credit_lot(id,participant_id,source,funding,applicability,issued_minor,available_minor,issued_at,source_reference,state) VALUES('credit:a2-bad','participant:member','SHIPPING_CREDIT','CLUB_FUNDED','SHIPPING',1000,1000,now(),'bad:a2','AVAILABLE')" >/dev/null 2>&1; then echo "A2 member-funded overpayment invariant bypass unexpectedly succeeded" >&2; exit 1; fi
if "${PSQL[@]}" -c "INSERT INTO membership_shopping_credit_lot(id,participant_id,source,funding,applicability,issued_minor,available_minor,issued_at,source_reference,state) VALUES('credit:a2-replay','participant:member','SHIPPING_CREDIT','MEMBER_FUNDED','SHIPPING',1000,1000,now(),'membership-overpayment:settlement:a2-over','AVAILABLE')" >/dev/null 2>&1; then echo "A2 shopping-credit source replay unexpectedly succeeded" >&2; exit 1; fi

# RC3-BIND-001: external identity resolves to one durable canonical participant and governed scopes.
"${PSQL[@]}" <<'SQL'
INSERT INTO application_identity_binding(binding_id,issuer,subject,participant_id,scopes,state,provider_evidence_id,bound_at,bound_by,authority_grant_id) VALUES('binding:live','https://issuer.example/','subject:1','participant:member',ARRAY['member:orders.read'],'ACTIVE','evidence:identity:1',now(),'participant:operator','grant:operator:orders');
SQL
binding=$("${PSQL[@]}" -Atc "SELECT participant_id||':'||state FROM application_identity_binding WHERE issuer='https://issuer.example/' AND subject='subject:1'")
[[ "$binding" == "participant:member:ACTIVE" ]] || { echo "application identity binding did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO application_identity_binding(binding_id,issuer,subject,participant_id,scopes,state,provider_evidence_id,bound_at,bound_by,authority_grant_id) VALUES('binding:rebind','https://issuer.example/','subject:1','participant:operator',ARRAY['operator:orders.read'],'ACTIVE','evidence:identity:2',now(),'participant:operator','grant:operator:orders')" >/dev/null 2>&1; then echo "external identity was silently rebound" >&2; exit 1; fi

# INV-027: durable result survives a fresh connection.
"${PSQL[@]}" <<'SQL'
INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,created_at,updated_at) VALUES('idem:live','cmd:live','IN_FLIGHT','worker:a',now()+interval '1 minute',1,now(),now());
UPDATE durable_command_execution SET state='COMMITTED',result_json='{"status":"ACCEPTED","eventIds":["event:live"],"replayed":false}'::jsonb,updated_at=now() WHERE idempotency_key='idem:live' AND command_id='cmd:live' AND owner_token='worker:a' AND fence_generation=1;
SQL
result=$("${PSQL[@]}" -Atc "SELECT result_json->>'status' FROM durable_command_execution WHERE idempotency_key='idem:live'")
[[ "$result" == "ACCEPTED" ]] || { echo "committed command result did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,created_at,updated_at) VALUES('idem:live','cmd:other','IN_FLIGHT','worker:b',now()+interval '1 minute',now(),now())" >/dev/null 2>&1; then echo "duplicate idempotency key unexpectedly succeeded" >&2; exit 1; fi

# RC1-B02: every takeover advances a monotonic fence. A stale owner/fence cannot commit.
"${PSQL[@]}" <<'SQL'
INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,created_at,updated_at) VALUES('idem:fence','cmd:fence','IN_FLIGHT','worker:a',now()-interval '1 second',1,now()-interval '1 minute',now()-interval '1 minute');
UPDATE durable_command_execution SET owner_token='worker:b', fence_generation=fence_generation+1, lease_until=now()+interval '1 minute', updated_at=now() WHERE idempotency_key='idem:fence' AND state='IN_FLIGHT' AND lease_until<=now();
SQL
fence=$("${PSQL[@]}" -Atc "SELECT fence_generation FROM durable_command_execution WHERE idempotency_key='idem:fence'")
[[ "$fence" == "2" ]] || { echo "takeover did not advance fence" >&2; exit 1; }
stale=$("${PSQL[@]}" -Atc "WITH u AS (UPDATE durable_command_execution SET state='COMMITTED',result_json='{}'::jsonb WHERE idempotency_key='idem:fence' AND owner_token='worker:a' AND fence_generation=1 RETURNING 1) SELECT count(*) FROM u")
[[ "$stale" == "0" ]] || { echo "stale owner/fence committed" >&2; exit 1; }
"${PSQL[@]}" -c "UPDATE durable_command_execution SET owner_token='worker:a',fence_generation=3,lease_until=now()+interval '1 minute' WHERE idempotency_key='idem:fence'" >/dev/null
same_owner_stale=$("${PSQL[@]}" -Atc "WITH u AS (UPDATE durable_command_execution SET state='COMMITTED',result_json='{}'::jsonb WHERE idempotency_key='idem:fence' AND owner_token='worker:a' AND fence_generation=1 RETURNING 1) SELECT count(*) FROM u")
[[ "$same_owner_stale" == "0" ]] || { echo "same-owner stale fence committed" >&2; exit 1; }

# INV-028: aggregate version is a database serialization boundary.
"${PSQL[@]}" <<'SQL'
INSERT INTO aggregate_version(aggregate_id,version) VALUES('order:1',0);
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT version FROM aggregate_version WHERE aggregate_id='order:1' FOR UPDATE;
INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at) VALUES('event:1','order:1',1,'ORDER_ACCEPTED','{}'::jsonb,now());
UPDATE aggregate_version SET version=1 WHERE aggregate_id='order:1' AND version=0;
COMMIT;
SQL
version=$("${PSQL[@]}" -Atc "SELECT version FROM aggregate_version WHERE aggregate_id='order:1'")
[[ "$version" == "1" ]] || { echo "aggregate version did not advance" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at) VALUES('event:stale','order:1',1,'STALE_WRITE','{}'::jsonb,now())" >/dev/null 2>&1; then echo "stale aggregate version unexpectedly succeeded" >&2; exit 1; fi
if "${PSQL[@]}" <<'SQL' >/dev/null 2>&1
BEGIN;
INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at) VALUES('event:rollback','order:1',2,'SHOULD_ROLLBACK','{}'::jsonb,now());
UPDATE aggregate_version SET version=2 WHERE aggregate_id='order:1' AND version=1;
SELECT 1/0;
COMMIT;
SQL
then echo "intentional transaction failure unexpectedly committed" >&2; exit 1; fi
count=$("${PSQL[@]}" -Atc "SELECT count(*) FROM canonical_event WHERE event_id='event:rollback'")
version=$("${PSQL[@]}" -Atc "SELECT version FROM aggregate_version WHERE aggregate_id='order:1'")
[[ "$count" == "0" && "$version" == "1" ]] || { echo "rollback left partial canonical state" >&2; exit 1; }

# INV-007/008 / RC1-B05: durable exact multi-input/multi-output lineage.
"${PSQL[@]}" <<'SQL'
INSERT INTO lineage_lot(lot_id,quantity,unit) VALUES('lot:a',40,'kg'),('lot:b',60,'kg');
SELECT record_lineage_transform('transform:blend','PROCESS','kg',3,'2026-09-08T02:10:00Z','["evidence:blend"]'::jsonb,'[{"lotId":"lot:a","quantity":40},{"lotId":"lot:b","quantity":60}]'::jsonb,'[{"lotId":"lot:c","quantity":70},{"lotId":"lot:d","quantity":27}]'::jsonb);
SQL
c=$("${PSQL[@]}" -Atc "SELECT quantity FROM lineage_lot WHERE lot_id='lot:c'")
d=$("${PSQL[@]}" -Atc "SELECT quantity FROM lineage_lot WHERE lot_id='lot:d'")
a_used=$("${PSQL[@]}" -Atc "SELECT consumed_quantity FROM lineage_lot WHERE lot_id='lot:a'")
b_used=$("${PSQL[@]}" -Atc "SELECT consumed_quantity FROM lineage_lot WHERE lot_id='lot:b'")
[[ "$c" == "70" && "$d" == "27" && "$a_used" == "40" && "$b_used" == "60" ]] || { echo "explicit durable lineage quantities incorrect" >&2; exit 1; }
inputs=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_transform_input WHERE transform_id='transform:blend'")
outputs=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_transform_output WHERE transform_id='transform:blend'")
[[ "$inputs" == "2" && "$outputs" == "2" ]] || { echo "durable lineage ancestry ports missing" >&2; exit 1; }
if "${PSQL[@]}" -c "SELECT record_lineage_transform('transform:bad','REPACK','kg',0,'2026-09-08T02:11:00Z','[\"evidence:bad\"]'::jsonb,'[{\"lotId\":\"lot:c\",\"quantity\":71}]'::jsonb,'[{\"lotId\":\"lot:e\",\"quantity\":71}]'::jsonb)" >/dev/null 2>&1; then echo "lineage overconsumption unexpectedly succeeded" >&2; exit 1; fi
bad_transform=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_transform WHERE transform_id='transform:bad'")
bad_output=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_lot WHERE lot_id='lot:e'")
c_used=$("${PSQL[@]}" -Atc "SELECT consumed_quantity FROM lineage_lot WHERE lot_id='lot:c'")
[[ "$bad_transform" == "0" && "$bad_output" == "0" && "$c_used" == "0" ]] || { echo "failed lineage transform leaked partial state" >&2; exit 1; }

# RC2-COMMS: preferences/consent survive connection boundaries and the outbox dedupe key is durable.
"${PSQL[@]}" <<'SQL'
INSERT INTO member_communication_consent_event(member_id,consent_version,promotional_opt_in,transactional_channels,promotional_channels,suppressed_channels,occurred_at) VALUES('member:live',1,false,ARRAY['IN_APP','EMAIL'],ARRAY['EMAIL'],ARRAY[]::text[],now());
INSERT INTO member_communication_preferences(member_id,transactional_channels,promotional_opt_in,promotional_channels,suppressed_channels,consent_version,consent_updated_at) VALUES('member:live',ARRAY['IN_APP','EMAIL'],false,ARRAY['EMAIL'],ARRAY[]::text[],1,now());
INSERT INTO communication_outbox(id,dedupe_key,event_id,member_id,subject_id,event_type,communication_class,template_id,template_version,channel,rendered_subject,rendered_body,status,queued_at,available_at,retry_count) VALUES('communication:live','event:payment|WFC-PAYMENT-CONFIRMED|1|IN_APP','event:payment','member:live','order:live','PAYMENT_CONFIRMED','TRANSACTIONAL','WFC-PAYMENT-CONFIRMED',1,'IN_APP','Payment confirmed','GHS 1.00 confirmed','QUEUED',now(),now(),0);
SQL
consent=$("${PSQL[@]}" -Atc "SELECT consent_version||':'||promotional_opt_in FROM member_communication_preferences WHERE member_id='member:live'")
[[ "$consent" == "1:false" ]] || { echo "communication preferences did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO communication_outbox(id,dedupe_key,event_id,member_id,subject_id,event_type,communication_class,template_id,template_version,channel,rendered_subject,rendered_body,status,queued_at,available_at,retry_count) VALUES('communication:duplicate','event:payment|WFC-PAYMENT-CONFIRMED|1|IN_APP','event:payment','member:live','order:live','PAYMENT_CONFIRMED','TRANSACTIONAL','WFC-PAYMENT-CONFIRMED',1,'IN_APP','dup','dup','QUEUED',now(),now(),0)" >/dev/null 2>&1; then echo "communication durable dedupe unexpectedly allowed duplicate" >&2; exit 1; fi
claimed=$("${PSQL[@]}" -Atc "WITH picked AS (SELECT id FROM communication_outbox WHERE status='QUEUED' AND available_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE communication_outbox o SET lease_owner='worker:comms',lease_until=now()+interval '30 seconds' FROM picked WHERE o.id=picked.id RETURNING o.id")
[[ "$claimed" == "communication:live" ]] || { echo "communication outbox row was not claimable" >&2; exit 1; }

# J20 durable catalog: atomic publication, version monotonicity, soft lifecycle and audit lineage.
"${PSQL[@]}" <<'SQL'
INSERT INTO catalog_category(category_id,name,active,created_by,updated_by) VALUES('category:staples','Staples',true,'participant:operator','participant:operator');
WITH candidate AS MATERIALIZED (SELECT category_id FROM catalog_category WHERE category_id='category:staples' AND active=true AND 1 > COALESCE((SELECT max(version) FROM catalog_specification WHERE specification_id='spec:rice'),0)),
deactivated AS (UPDATE catalog_specification SET active=false WHERE specification_id='spec:rice' AND active=true AND EXISTS(SELECT 1 FROM candidate) RETURNING specification_id),
spec AS (INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by) SELECT 'spec:rice',1,'Rice','kg',category_id,true,'participant:operator' FROM candidate RETURNING *),
listing AS (INSERT INTO catalog_listing(listing_id,sku,specification_id,specification_version,display_name,active,created_by,updated_by) SELECT 'listing:rice','RICE-5KG','spec:rice',1,'Rice 5 kg',true,'participant:operator','participant:operator' FROM spec RETURNING *)
INSERT INTO catalog_audit_event(event_id,entity_type,entity_id,action,actor_id,after_state) SELECT 'catalog:event:initial','LISTING',listing_id,'CREATE','participant:operator',to_jsonb(listing) FROM listing;
SQL
catalog_state=$("${PSQL[@]}" -Atc "SELECT l.sku||':'||s.version||':'||s.active FROM catalog_listing l JOIN catalog_specification s ON s.specification_id=l.specification_id AND s.version=l.specification_version WHERE l.listing_id='listing:rice'")
[[ "$catalog_state" == "RICE-5KG:1:true" ]] || { echo "J20 catalog publication did not persist" >&2; exit 1; }
# A duplicate/stale publication must not deactivate the current specification.
"${PSQL[@]}" -c "WITH candidate AS MATERIALIZED (SELECT category_id FROM catalog_category WHERE category_id='category:staples' AND active=true AND 1 > COALESCE((SELECT max(version) FROM catalog_specification WHERE specification_id='spec:rice'),0)), deactivated AS (UPDATE catalog_specification SET active=false WHERE specification_id='spec:rice' AND active=true AND EXISTS(SELECT 1 FROM candidate) RETURNING 1), spec AS (INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by) SELECT 'spec:rice',1,'Bad','kg',category_id,true,'participant:operator' FROM candidate RETURNING 1) SELECT count(*) FROM spec" >/dev/null
active_version=$("${PSQL[@]}" -Atc "SELECT version FROM catalog_specification WHERE specification_id='spec:rice' AND active=true")
[[ "$active_version" == "1" ]] || { echo "J20 stale publication damaged active specification" >&2; exit 1; }
# A failed listing insert in the same data-modifying CTE statement must roll back specification supersession.
if "${PSQL[@]}" <<'SQL' >/dev/null 2>&1
WITH candidate AS MATERIALIZED (SELECT category_id FROM catalog_category WHERE category_id='category:staples' AND active=true AND 2 > COALESCE((SELECT max(version) FROM catalog_specification WHERE specification_id='spec:rice'),0)),
deactivated AS (UPDATE catalog_specification SET active=false WHERE specification_id='spec:rice' AND active=true AND EXISTS(SELECT 1 FROM candidate) RETURNING 1),
spec AS (INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by) SELECT 'spec:rice',2,'Rice v2','kg',category_id,true,'participant:operator' FROM candidate RETURNING *),
listing AS (INSERT INTO catalog_listing(listing_id,sku,specification_id,specification_version,display_name,active,created_by,updated_by) SELECT 'listing:duplicate','RICE-5KG','spec:rice',2,'Duplicate SKU',true,'participant:operator','participant:operator' FROM spec RETURNING *) SELECT * FROM listing;
SQL
then echo "J20 duplicate SKU unexpectedly succeeded" >&2; exit 1; fi
active_version=$("${PSQL[@]}" -Atc "SELECT version FROM catalog_specification WHERE specification_id='spec:rice' AND active=true")
v2_count=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_specification WHERE specification_id='spec:rice' AND version=2")
[[ "$active_version" == "1" && "$v2_count" == "0" ]] || { echo "J20 failed publication leaked partial state" >&2; exit 1; }
"${PSQL[@]}" -c "UPDATE catalog_listing SET active=false,updated_by='participant:operator',updated_at=now() WHERE listing_id='listing:rice'" >/dev/null
inactive=$("${PSQL[@]}" -Atc "SELECT active FROM catalog_listing WHERE listing_id='listing:rice'")
[[ "$inactive" == "f" ]] || { echo "J20 listing soft deactivation failed" >&2; exit 1; }
audit_count=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_audit_event WHERE entity_id='listing:rice'")
[[ "$audit_count" == "1" ]] || { echo "J20 audit lineage missing" >&2; exit 1; }

echo "live PostgreSQL durability, fencing, governed identity binding, explicit lineage, preview runtime schema, communications, A2 membership/credit, A10 support and J20 catalog proof passed"
