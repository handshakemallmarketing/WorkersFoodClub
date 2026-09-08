#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/foodclub_test}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -f packages/durability/sql/001_durable_command_execution.sql
"${PSQL[@]}" -f packages/durability/sql/002_canonical_event_store.sql
"${PSQL[@]}" -f packages/durability/sql/003_command_fencing.sql
"${PSQL[@]}" -f packages/durability/sql/004_physical_lineage.sql

"${PSQL[@]}" <<'SQL'
TRUNCATE lineage_transform_output,lineage_transform_input,lineage_transform,lineage_lot,canonical_event,aggregate_version,durable_command_execution;
SQL

# INV-027: durable result survives a fresh connection.
"${PSQL[@]}" <<'SQL'
INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,created_at,updated_at)
VALUES('idem:live','cmd:live','IN_FLIGHT','worker:a',now()+interval '1 minute',1,now(),now());
UPDATE durable_command_execution
SET state='COMMITTED',result_json='{"status":"ACCEPTED","eventIds":["event:live"],"replayed":false}'::jsonb,updated_at=now()
WHERE idempotency_key='idem:live' AND command_id='cmd:live' AND owner_token='worker:a' AND fence_generation=1;
SQL
result=$("${PSQL[@]}" -Atc "SELECT result_json->>'status' FROM durable_command_execution WHERE idempotency_key='idem:live'")
[[ "$result" == "ACCEPTED" ]] || { echo "committed command result did not survive connection boundary" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,created_at,updated_at) VALUES('idem:live','cmd:other','IN_FLIGHT','worker:b',now()+interval '1 minute',now(),now())" >/dev/null 2>&1; then
  echo "duplicate idempotency key unexpectedly succeeded" >&2; exit 1
fi

# RC1-B02: every takeover advances a monotonic fence. A stale owner/fence cannot commit.
"${PSQL[@]}" <<'SQL'
INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,created_at,updated_at)
VALUES('idem:fence','cmd:fence','IN_FLIGHT','worker:a',now()-interval '1 second',1,now()-interval '1 minute',now()-interval '1 minute');
UPDATE durable_command_execution
SET owner_token='worker:b', fence_generation=fence_generation+1, lease_until=now()+interval '1 minute', updated_at=now()
WHERE idempotency_key='idem:fence' AND state='IN_FLIGHT' AND lease_until<=now();
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
INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
VALUES('event:1','order:1',1,'ORDER_ACCEPTED','{}'::jsonb,now());
UPDATE aggregate_version SET version=1 WHERE aggregate_id='order:1' AND version=0;
COMMIT;
SQL
version=$("${PSQL[@]}" -Atc "SELECT version FROM aggregate_version WHERE aggregate_id='order:1'")
[[ "$version" == "1" ]] || { echo "aggregate version did not advance" >&2; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at) VALUES('event:stale','order:1',1,'STALE_WRITE','{}'::jsonb,now())" >/dev/null 2>&1; then
  echo "stale aggregate version unexpectedly succeeded" >&2; exit 1
fi
if "${PSQL[@]}" <<'SQL' >/dev/null 2>&1
BEGIN;
INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
VALUES('event:rollback','order:1',2,'SHOULD_ROLLBACK','{}'::jsonb,now());
UPDATE aggregate_version SET version=2 WHERE aggregate_id='order:1' AND version=1;
SELECT 1/0;
COMMIT;
SQL
then
  echo "intentional transaction failure unexpectedly committed" >&2; exit 1
fi
count=$("${PSQL[@]}" -Atc "SELECT count(*) FROM canonical_event WHERE event_id='event:rollback'")
version=$("${PSQL[@]}" -Atc "SELECT version FROM aggregate_version WHERE aggregate_id='order:1'")
[[ "$count" == "0" && "$version" == "1" ]] || { echo "rollback left partial canonical state" >&2; exit 1; }

# INV-007/008 / RC1-B05: durable exact multi-input/multi-output lineage.
"${PSQL[@]}" <<'SQL'
INSERT INTO lineage_lot(lot_id,quantity,unit) VALUES('lot:a',40,'kg'),('lot:b',60,'kg');
SELECT record_lineage_transform(
 'transform:blend','PROCESS','kg',3,'2026-09-08T02:10:00Z','["evidence:blend"]'::jsonb,
 '[{"lotId":"lot:a","quantity":40},{"lotId":"lot:b","quantity":60}]'::jsonb,
 '[{"lotId":"lot:c","quantity":70},{"lotId":"lot:d","quantity":27}]'::jsonb
);
SQL
c=$("${PSQL[@]}" -Atc "SELECT quantity FROM lineage_lot WHERE lot_id='lot:c'")
d=$("${PSQL[@]}" -Atc "SELECT quantity FROM lineage_lot WHERE lot_id='lot:d'")
a_used=$("${PSQL[@]}" -Atc "SELECT consumed_quantity FROM lineage_lot WHERE lot_id='lot:a'")
b_used=$("${PSQL[@]}" -Atc "SELECT consumed_quantity FROM lineage_lot WHERE lot_id='lot:b'")
[[ "$c" == "70" && "$d" == "27" && "$a_used" == "40" && "$b_used" == "60" ]] || { echo "explicit durable lineage quantities incorrect" >&2; exit 1; }
inputs=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_transform_input WHERE transform_id='transform:blend'")
outputs=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_transform_output WHERE transform_id='transform:blend'")
[[ "$inputs" == "2" && "$outputs" == "2" ]] || { echo "durable lineage ancestry ports missing" >&2; exit 1; }

# A failed overconsuming transform must leave no transform/output/partial consumption behind.
if "${PSQL[@]}" -c "SELECT record_lineage_transform('transform:bad','REPACK','kg',0,'2026-09-08T02:11:00Z','[\"evidence:bad\"]'::jsonb,'[{\"lotId\":\"lot:c\",\"quantity\":71}]'::jsonb,'[{\"lotId\":\"lot:e\",\"quantity\":71}]'::jsonb)" >/dev/null 2>&1; then
  echo "lineage overconsumption unexpectedly succeeded" >&2; exit 1
fi
bad_transform=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_transform WHERE transform_id='transform:bad'")
bad_output=$("${PSQL[@]}" -Atc "SELECT count(*) FROM lineage_lot WHERE lot_id='lot:e'")
c_used=$("${PSQL[@]}" -Atc "SELECT consumed_quantity FROM lineage_lot WHERE lot_id='lot:c'")
[[ "$bad_transform" == "0" && "$bad_output" == "0" && "$c_used" == "0" ]] || { echo "failed lineage transform leaked partial state" >&2; exit 1; }

echo "live PostgreSQL durability, fencing and explicit lineage proof passed"
