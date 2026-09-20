#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)
"${PSQL[@]}" -f packages/durability/sql/027_catalog_administration_v1.sql
suffix="${GITHUB_RUN_ID:-local}-$$"
category="category:j20:$suffix"; spec="spec:j20:$suffix"; listing="listing:j20:$suffix"; sku="J20-$suffix"
"${PSQL[@]}" -c "INSERT INTO catalog_category(category_id,name,active,created_by,updated_by) VALUES('$category','J20 $suffix',true,'test:j20','test:j20')" >/dev/null
"${PSQL[@]}" -c "INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by) VALUES('$spec',1,'J20','unit','$category',true,'test:j20'); INSERT INTO catalog_listing(listing_id,sku,specification_id,specification_version,display_name,active,created_by,updated_by) VALUES('$listing','$sku','$spec',1,'J20',true,'test:j20','test:j20');" >/dev/null
state=$("${PSQL[@]}" -Atc "SELECT specification_version||':'||active FROM catalog_listing WHERE listing_id='$listing'")
[[ "$state" == "1:true" ]] || { echo 'J20 initial publication failed' >&2; exit 1; }
if "${PSQL[@]}" <<SQL >/dev/null 2>&1
BEGIN;
INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by) VALUES('$spec',2,'J20 v2','unit','$category',true,'test:j20');
COMMIT;
SQL
then echo 'J20 deferred active-version invariant accepted two active versions' >&2; exit 1; fi
v2=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_specification WHERE specification_id='$spec' AND version=2")
active=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_specification WHERE specification_id='$spec' AND active=true")
[[ "$v2" == "0" && "$active" == "1" ]] || { echo 'J20 deferred invariant did not roll back atomically' >&2; exit 1; }
"${PSQL[@]}" -c "BEGIN; UPDATE catalog_specification SET active=false WHERE specification_id='$spec' AND version=1; INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by) VALUES('$spec',2,'J20 v2','unit','$category',true,'test:j20'); UPDATE catalog_listing SET specification_version=2,updated_by='test:j20' WHERE listing_id='$listing'; COMMIT;" >/dev/null
state=$("${PSQL[@]}" -Atc "SELECT l.specification_version||':'||s.active FROM catalog_listing l JOIN catalog_specification s ON s.specification_id=l.specification_id AND s.version=l.specification_version WHERE l.listing_id='$listing'")
[[ "$state" == "2:true" ]] || { echo 'J20 valid supersession failed' >&2; exit 1; }
echo 'J20 PostgreSQL transaction-level durability invariant passed'
