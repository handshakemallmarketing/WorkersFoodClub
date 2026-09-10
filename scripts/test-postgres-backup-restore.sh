#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/foodclub_test}"
SOURCE_DB="${RC2_SOURCE_DB:-foodclub_test}"
RESTORE_DB="${RC2_RESTORE_DB:-foodclub_rc2_restore}"

[[ "$SOURCE_DB" != "$RESTORE_DB" ]] || { echo "restore target must be isolated from source" >&2; exit 1; }
[[ "$RESTORE_DB" != *prod* && "$RESTORE_DB" != *production* ]] || { echo "production-like restore target name forbidden" >&2; exit 1; }

base_url="${DATABASE_URL%/*}"
source_url="$base_url/$SOURCE_DB"
restore_url="$base_url/$RESTORE_DB"
admin_url="$base_url/postgres"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"; psql "$admin_url" -v ON_ERROR_STOP=1 -X -q -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\" WITH (FORCE)" >/dev/null 2>&1 || true' EXIT
backup="$workdir/rc2.backup"

# Seed deterministic canonical state in the source database using the same durable schema.
psql "$source_url" -v ON_ERROR_STOP=1 -X -q -f packages/durability/sql/001_durable_command_execution.sql
psql "$source_url" -v ON_ERROR_STOP=1 -X -q -f packages/durability/sql/002_canonical_event_store.sql
psql "$source_url" -v ON_ERROR_STOP=1 -X -q -f packages/durability/sql/003_command_fencing.sql
psql "$source_url" -v ON_ERROR_STOP=1 -X -q -f packages/durability/sql/004_physical_lineage.sql
psql "$source_url" -v ON_ERROR_STOP=1 -X -q <<'SQL'
TRUNCATE lineage_transform_output,lineage_transform_input,lineage_transform,lineage_lot,canonical_event,aggregate_version,durable_command_execution;
INSERT INTO aggregate_version(aggregate_id,version) VALUES('order:rc2:restore',1);
INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
VALUES('event:rc2:restore','order:rc2:restore',1,'ORDER_ACCEPTED','{"quantity":5,"unit":"kg","participantId":"member:restore"}'::jsonb,'2026-09-10T12:00:00Z');
INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,fence_generation,result_json,created_at,updated_at)
VALUES('idem:rc2:restore','cmd:rc2:restore','COMMITTED','worker:rc2',1,'{"status":"ACCEPTED","eventIds":["event:rc2:restore"]}'::jsonb,now(),now());
INSERT INTO lineage_lot(lot_id,quantity,unit,consumed_quantity) VALUES('lot:rc2:restore',5,'kg',0);
SQL

source_digest=$(psql "$source_url" -AtX -c "SELECT md5(string_agg(row_data,'|' ORDER BY row_data)) FROM (SELECT event_id||':'||aggregate_id||':'||aggregate_version||':'||event_type||':'||payload::text AS row_data FROM canonical_event UNION ALL SELECT idempotency_key||':'||command_id||':'||state||':'||coalesce(result_json::text,'') FROM durable_command_execution UNION ALL SELECT lot_id||':'||quantity||':'||unit||':'||consumed_quantity FROM lineage_lot) s")
[[ -n "$source_digest" ]] || { echo "source canonical digest missing" >&2; exit 1; }

pg_dump --format=custom --no-owner --no-acl --file="$backup" "$source_url"
[[ -s "$backup" ]] || { echo "backup artifact missing or empty" >&2; exit 1; }

psql "$admin_url" -v ON_ERROR_STOP=1 -X -q -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\" WITH (FORCE)"
psql "$admin_url" -v ON_ERROR_STOP=1 -X -q -c "CREATE DATABASE \"$RESTORE_DB\""
pg_restore --no-owner --no-acl --exit-on-error --dbname="$restore_url" "$backup"

restore_digest=$(psql "$restore_url" -AtX -c "SELECT md5(string_agg(row_data,'|' ORDER BY row_data)) FROM (SELECT event_id||':'||aggregate_id||':'||aggregate_version||':'||event_type||':'||payload::text AS row_data FROM canonical_event UNION ALL SELECT idempotency_key||':'||command_id||':'||state||':'||coalesce(result_json::text,'') FROM durable_command_execution UNION ALL SELECT lot_id||':'||quantity||':'||unit||':'||consumed_quantity FROM lineage_lot) s")
[[ "$restore_digest" == "$source_digest" ]] || { echo "restored canonical digest differs from source" >&2; exit 1; }

# Prove restored canonical state is independently queryable and can deterministically rebuild a material order summary.
summary=$(psql "$restore_url" -AtX -c "SELECT aggregate_id||':'||aggregate_version||':'||(payload->>'quantity')||':'||(payload->>'unit') FROM canonical_event WHERE event_id='event:rc2:restore'")
[[ "$summary" == "order:rc2:restore:1:5:kg" ]] || { echo "restored projection input did not rebuild deterministically" >&2; exit 1; }

# Isolation proof: mutation of restored copy cannot alter source canonical state.
psql "$restore_url" -v ON_ERROR_STOP=1 -X -q -c "UPDATE aggregate_version SET version=99 WHERE aggregate_id='order:rc2:restore'"
source_version=$(psql "$source_url" -AtX -c "SELECT version FROM aggregate_version WHERE aggregate_id='order:rc2:restore'")
[[ "$source_version" == "1" ]] || { echo "restore rehearsal mutated source database" >&2; exit 1; }

echo "RC2 isolated PostgreSQL backup/restore and deterministic rebuild proof passed: $source_digest"
