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

# A listing activation holds a share lock on its source specification. A concurrent
# attempt to deactivate that specification must wait and then fail, rather than
# committing an active listing -> inactive specification chain.
race_listing="listing:j20:chain:$suffix"; race_spec="spec:j20:chain:$suffix"
"${PSQL[@]}" -c "SELECT * FROM catalog_publish_specification_and_listing('$race_listing','$sku-CHAIN','$race_spec',1,'Chain','Chain','unit','$category','$actor','event:listing:chain:$suffix','event:spec:chain:$suffix','event:supersede:chain:$suffix'); UPDATE catalog_listing SET active=false WHERE listing_id='$race_listing'" >/dev/null
set +e
"${PSQL[@]}" -c "BEGIN; UPDATE catalog_listing SET active=true WHERE listing_id='$race_listing'; SELECT pg_sleep(2); COMMIT" >/tmp/j20-chain-listing-"$suffix".log 2>&1 & p1=$!
sleep 0.3
"${PSQL[@]}" -c "UPDATE catalog_specification SET active=false WHERE specification_id='$race_spec' AND version=1" >/tmp/j20-chain-spec-"$suffix".log 2>&1 & p2=$!
wait "$p1"; s1=$?
wait "$p2"; s2=$?
set -e
rm -f /tmp/j20-chain-listing-"$suffix".log /tmp/j20-chain-spec-"$suffix".log
[[ "$s1" == 0 && "$s2" != 0 ]] || { echo "J20 listing/specification race did not preserve the active chain; statuses=$s1,$s2" >&2; exit 1; }

# Publication and governed category mutation take the same stable advisory
# lock before their state-changing snapshots. A concurrent deactivation must
# wait and then fail after seeing the published active specification.
race_category="category:j20:chain:$suffix"; race_category_spec="spec:j20:category-chain:$suffix"
"${PSQL[@]}" -c "INSERT INTO catalog_category(category_id,name,active,created_by,updated_by) VALUES('$race_category','J20 chain category $suffix',true,'$actor','$actor')" >/dev/null
set +e
"${PSQL[@]}" -c "BEGIN; SELECT * FROM catalog_publish_specification_and_listing('listing:j20:category-chain:$suffix','$sku-CATEGORY-CHAIN','$race_category_spec',1,'Category chain','Category chain','unit','$race_category','$actor','event:listing:category-chain:$suffix','event:spec:category-chain:$suffix','event:supersede:category-chain:$suffix'); SELECT pg_sleep(2); COMMIT" >/tmp/j20-chain-category-spec-"$suffix".log 2>&1 & p1=$!
sleep 0.3
"${PSQL[@]}" -c "SELECT * FROM catalog_mutate_category('$race_category',NULL,false,'$actor','event:category:chain:$suffix',true)" >/tmp/j20-chain-category-"$suffix".log 2>&1 & p2=$!
wait "$p1"; s1=$?
wait "$p2"; s2=$?
set -e
rm -f /tmp/j20-chain-category-spec-"$suffix".log /tmp/j20-chain-category-"$suffix".log
[[ "$s1" == 0 && "$s2" != 0 ]] || { echo "J20 specification/category race did not preserve the active chain; statuses=$s1,$s2" >&2; exit 1; }
chain=$("${PSQL[@]}" -Atc "SELECT l.active||':'||s.active||':'||c.active FROM catalog_listing l JOIN catalog_specification s ON (s.specification_id,s.version)=(l.specification_id,l.specification_version) JOIN catalog_category c ON c.category_id=s.category_id WHERE l.listing_id='listing:j20:category-chain:$suffix'")
[[ "$chain" == "true:true:true" ]] || { echo "J20 publication/category race left an invalid chain: $chain" >&2; exit 1; }

audit=$("${PSQL[@]}" -Atc "SELECT count(*) FROM catalog_audit_event WHERE actor_id='$actor' AND entity_id IN ('$listing','$spec:3')")
[[ "$audit" -ge 2 ]] || { echo 'J20 publication audit lineage missing' >&2; exit 1; }
echo 'J20 PostgreSQL serialization, identity, cross-table race, active-chain, normalization and audit invariants passed'
