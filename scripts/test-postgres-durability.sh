#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/foodclub_test}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -f packages/durability/sql/001_durable_command_execution.sql
"${PSQL[@]}" -f packages/durability/sql/002_canonical_event_store.sql
"${PSQL[@]}" -f packages/durability/sql/003_command_fencing.sql

"${PSQL[@]}" <<'SQL'
TRUNCATE canonical_event, aggregate_version, durable_command_execution;
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
# Same worker identity is not enough: only the current fence may commit.
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

echo "live PostgreSQL durability and fencing proof passed"
