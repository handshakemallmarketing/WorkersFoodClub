#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)
"${PSQL[@]}" -f packages/durability/sql/027_catalog_administration_v1.sql
suffix="${GITHUB_RUN_ID:-local}-$$"
category="category:j20:$suffix"; spec="spec:j20:$suffix"; listing="listing:j20:$suffix"; sku="J20-$suffix"
actor='test:j20'

"${PSQL[@]}" -c "INSERT INTO catalog_category(category_id,name,active,created_by,updated_by) VALUES('$category','J20 $suffix',true,'$actor','$actor')" >/dev/null
"${PSQL[@]}" -c "SELECT * FROM catalog_publish_specification_and_listing('$listing','$sku','$spec',1,'J20','J20','unit','$category','$actor','event:listing:1:$suffix','event:spec:1:$suffix','event:supersede:1:$suffix')" >/dev/null
state=$("${PSQL[@]}" -Atc "SELECT l.specification_version||':'||l.active||':'||s.active||':'||c.active FROM catalog_listing l JOIN catalog_specification s ON s.specification_id=l.specification_id AND s.version=l.specification_version JOIN catalog_category c ON c.category_id=s.category_id WHERE l.listing_id='$listing'")
[[ "$state" == "1:true:true:true" ]] || { echo 'J20 initial publication chain failed' >&2; exit 1; }

if "${PSQL[@]}" -c "INSERT INTO catalog_category(category_id,name,active,created_by,updated_by) VALUES('$category:duplicate','  j20 $suffix  ',true,'$actor','$actor')" >/dev/null 2>&1; then
 echo 'J20 normalized category uniqueness accepted a semantic duplicate' >&2; exit 1
fi

"${PSQL[@]}" -c "SELECT * FROM catalog_publish_specification_and_listing('$listing','$sku','$spec',2,'J20 v2','J20 v2','unit','$category','$actor','event:listing:2:$suffix','event:spec:2:$suffix','event:supersede:2:$suffix')" >/dev/null
state=$("${PSQL[@]}" -Atc "SELECT specification_version||':'||active FROM catalog_listing WHERE listing_id='$listing'")
active=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_specification WHERE specification_id='$spec' AND active")
[[ "$state" == "2:true" && "$active" == "1" ]] || { echo 'J20 valid supersession failed' >&2; exit 1; }

set +e
"${PSQL[@]}" -c "SELECT * FROM catalog_publish_specification_and_listing('$listing','$sku','$spec',3,'J20 v3','J20 v3','unit','$category','$actor','event:listing:3a:$suffix','event:spec:3a:$suffix','event:supersede:3a:$suffix')" >/tmp/j20-race-a-"$suffix".log 2>&1 & p1=$!
"${PSQL[@]}" -c "SELECT * FROM catalog_publish_specification_and_listing('$listing','$sku','$spec',3,'J20 v3','J20 v3','unit','$category','$actor','event:listing:3b:$suffix','event:spec:3b:$suffix','event:supersede:3b:$suffix')" >/tmp/j20-race-b-"$suffix".log 2>&1 & p2=$!
wait "$p1"; s1=$?
wait "$p2"; s2=$?
set -e
if ! { [[ "$s1" == 0 && "$s2" != 0 ]] || [[ "$s1" != 0 && "$s2" == 0 ]]; }; then
 echo "J20 concurrent publication expected exactly one winner; statuses=$s1,$s2" >&2; exit 1
fi
rm -f /tmp/j20-race-a-"$suffix".log /tmp/j20-race-b-"$suffix".log
state=$("${PSQL[@]}" -Atc "SELECT specification_version||':'||active FROM catalog_listing WHERE listing_id='$listing'")
active=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_specification WHERE specification_id='$spec' AND active")
[[ "$state" == "3:true" && "$active" == "1" ]] || { echo 'J20 concurrent publication broke active-version truth' >&2; exit 1; }

other_spec="spec:j20:other:$suffix"
if "${PSQL[@]}" -c "SELECT * FROM catalog_publish_specification_and_listing('$listing','$sku-OTHER','$other_spec',1,'Other','Other','unit','$category','$actor','event:listing:rebound:$suffix','event:spec:rebound:$suffix','event:supersede:rebound:$suffix')" >/dev/null 2>&1; then
 echo 'J20 allowed listing identity rebound across specifications' >&2; exit 1
fi
binding=$("${PSQL[@]}" -Atc "SELECT specification_id||':'||specification_version FROM catalog_listing WHERE listing_id='$listing'")
[[ "$binding" == "$spec:3" ]] || { echo 'J20 rebound attempt changed listing binding' >&2; exit 1; }

if "${PSQL[@]}" -c "UPDATE catalog_category SET active=false WHERE category_id='$category'" >/dev/null 2>&1; then
 echo 'J20 allowed category deactivation with active specification' >&2; exit 1
fi
if "${PSQL[@]}" -c "UPDATE catalog_listing SET specification_version=2 WHERE listing_id='$listing'" >/dev/null 2>&1; then
 echo 'J20 allowed active listing to reference inactive specification' >&2; exit 1
fi
if "${PSQL[@]}" -c "INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by) VALUES('$spec',99,'J20 invalid','unit','$category',true,'$actor')" >/dev/null 2>&1; then
 echo 'J20 unique active-version invariant accepted a second active version' >&2; exit 1
fi

audit=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_audit_event WHERE actor_id='$actor' AND entity_id IN ('$listing','$spec:3')")
[[ "$audit" -ge 2 ]] || { echo 'J20 publication audit lineage missing' >&2; exit 1; }
echo 'J20 PostgreSQL serialization, identity, active-chain, normalization and audit invariants passed'
