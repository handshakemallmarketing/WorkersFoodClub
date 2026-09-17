import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const api=await readFile(new URL('../../api/support-case.js',import.meta.url),'utf8');
const transition=await readFile(new URL('../../api/support-case-transition.js',import.meta.url),'utf8');
const sql=await readFile(new URL('../../packages/durability/sql/014_wave2_support_case.sql',import.meta.url),'utf8');
const durability=await readFile(new URL('../../scripts/test-postgres-durability.sh',import.meta.url),'utf8');

test('UC-28 support command is Preview-only and pinned to canonical operator',()=>{
 assert.match(api,/operator:support\.manage/);assert.match(api,/PREVIEW_OPERATOR_ID='preview:operator:001'/);assert.match(api,/VERCEL_ENV!=='preview'/);assert.match(transition,/VERCEL_ENV!=='preview'/);assert.doesNotMatch(api,/req\.body\?\.actorId/);assert.doesNotMatch(transition,/req\.body\?\.actorId/);
});
test('UC-28 authentication provenance is stored under accurate current names while legacy names exist only in upgrade logic',()=>{
 assert.match(sql,/created_by_authn_subject_ref text NOT NULL/);assert.match(sql,/authn_subject_ref text NOT NULL/);assert.match(sql,/RENAME COLUMN created_by_authority_ref TO created_by_authn_subject_ref/);assert.match(sql,/RENAME COLUMN authority_ref TO authn_subject_ref/);assert.match(sql,/not an authority-grant identifier/);
});
test('UC-28 support state cannot write canonical economic or physical truth',()=>{
 for(const x of ['preview_member_payment','preview_member_commitment','preview_member_credit','preview_member_refund','preview_fulfillment','canonical_event']){assert.equal(api.includes(x),false,x);assert.equal(transition.includes(x),false,x);}
});
test('UC-28 case lifecycle is versioned and actor-bound',()=>{
 assert.match(sql,/state_version bigint NOT NULL DEFAULT 1/);assert.match(sql,/created_by_actor_id text NOT NULL/);assert.match(sql,/UNIQUE \(case_id\s*,\s*state_version\)/);assert.match(sql,/UNIQUE \(actor_id\s*,\s*command_idempotency_key\)/);
});
test('UC-28 transition graph rejects new same-state movement, preserves legacy opening rows and governs reopen',()=>{
 assert.match(sql,/CHECK \(from_state IS NULL OR from_state <> to_state\)/);assert.match(sql,/from_state='CLOSED' AND to_state='OPEN'/);assert.match(transition,/SUPPORT_CASE_TRANSITION_NOT_ALLOWED/);assert.match(transition,/WHEN \$\{toState\}='OPEN' THEN NULL/);
});
test('UC-28 create replay is actor-bound and changed payload fails closed',()=>{
 assert.match(sql,/UNIQUE \(created_by_actor_id, command_idempotency_key\)/);assert.match(api,/sameCommand\(prior\[0\],command\)/);assert.match(api,/SUPPORT_CASE_REQUEST_REBOUND/);assert.match(api,/error\?\.code==='23505'&&sql/);
});
test('UC-28 accepted inputs remain replay-stable and evidence is reference-only',()=>{
 assert.match(api,/PARTICIPANT_ID_INVALID/);assert.match(api,/EVIDENCE_REFS_INVALID/);assert.match(api,/Array\.isArray\(value\)&&value\.length<=32/);assert.match(transition,/Array\.isArray\(value\)&&value\.length<=32/);
});
test('UC-28 create replay preserves immutable opening result',()=>{assert.match(api,/state:'OPEN',stateVersion:1/);assert.match(api,/updatedAt:String\(r\.opened_at\)/);});
test('UC-28 transition concurrent retry rechecks durable command identity',()=>{assert.match(transition,/const raced=await sql/);assert.match(transition,/sameCommand\(raced\[0\],command\)/);assert.match(transition,/error\?\.code==='23505'&&sql/);});
test('UC-28 support schema is a forward-only migration applied by durability harness',()=>{assert.match(durability,/014_wave2_support_case\.sql/);assert.match(durability,/TRUNCATE support_case_transition,support_case/);});
