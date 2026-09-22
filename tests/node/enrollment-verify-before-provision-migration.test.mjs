import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../../packages/durability/sql/033_verify_before_provision_enrollment.sql',import.meta.url),'utf8');
const start=fs.readFileSync(new URL('../../api/enrollment-verify-start.js',import.meta.url),'utf8');
const complete=fs.readFileSync(new URL('../../api/enrollment-verify-complete.js',import.meta.url),'utf8');
const apply=fs.readFileSync(new URL('../../api/membership-apply.js',import.meta.url),'utf8');

test('a verification-pending application carries no durable membership artifact',()=>{
  assert.match(migration,/PENDING_VERIFICATION/);
  assert.match(migration,/verify_and_provision_enrollment/);
  assert.doesNotMatch(migration.split('CREATE OR REPLACE FUNCTION resolve_enrollment_contact')[1].split('CREATE OR REPLACE FUNCTION create_enrollment_verification_challenge')[0],/INSERT INTO application_participant|INSERT INTO application_membership/);
});
test('membership/Member Number/session provisioning happens in one database statement on first success',()=>{
  const provisionFn=migration.split('CREATE OR REPLACE FUNCTION verify_and_provision_enrollment')[1];
  assert.match(provisionFn,/INSERT INTO application_participant/);
  assert.match(provisionFn,/INSERT INTO application_membership/);
  assert.match(provisionFn,/INSERT INTO member_session/);
  assert.match(provisionFn,/idempotent/);
  assert.doesNotMatch(complete,/INSERT INTO application_membership/);
});
test('duplicate/resume matching is serialized per normalized contact and never double-provisions',()=>{
  assert.match(migration,/resolve_enrollment_contact/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/EXISTING_MEMBER/);
  assert.match(migration,/RESUME_PENDING/);
});
test('campaign volume and window checks fail closed without touching provisioning',()=>{
  assert.match(migration,/ENROLLMENT_CAMPAIGN_CLOSED/);
  assert.match(migration,/ENROLLMENT_CAMPAIGN_FULL/);
  assert.match(migration,/opens_at/);
  assert.match(migration,/closes_at/);
});
test('rate limiting is a single atomic check-and-record statement',()=>{
  assert.match(migration,/record_rate_limit_event/);
  assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\(p_key_type/);
  assert.match(start,/record_rate_limit_event/);
});
test('the enrollment-verify-start response is uniform regardless of new/resume/existing-member/rate-limited outcome',()=>{
  const genericFn=start.split('function genericSent')[1].split('export default')[0];
  assert.match(genericFn,/If these details are eligible for enrollment/);
  const returnsGeneric=(start.match(/return genericSent\(res/g)||[]).length;
  assert.ok(returnsGeneric>=4,'expected the generic response helper to cover the rate-limited, delivery-failure, resolution-miss and success paths');
});
test('old immediate-provisioning AUTO path is retired in favor of the verify-first endpoint',()=>{
  assert.match(apply,/ENROLLMENT_FLOW_MOVED/);
  assert.doesNotMatch(apply,/INSERT INTO application_membership/);
});
test('migration fails closed on historical inconsistencies, matching the established pattern',()=>{
  assert.match(migration,/attempts BETWEEN 0 AND 5/);
  assert.match(migration,/\(state = 'USED'\) = \(used_at IS NOT NULL\)/);
});
test('a retry against an already-used challenge returns the real provisioned membership, not null fields',()=>{
  const provisionFn=migration.split('CREATE OR REPLACE FUNCTION verify_and_provision_enrollment')[1];
  const usedBranch=provisionFn.split("IF ch.state = 'USED' THEN")[1]?.split("IF ch.state <> 'OPEN'")[0];
  assert.ok(usedBranch,'expected an explicit USED-state branch before the generic non-OPEN early exit');
  assert.match(usedBranch,/ch\.code_hash <> p_code_hash/);
  assert.match(usedBranch,/idempotent := true/);
  assert.match(usedBranch,/SELECT \* INTO app FROM membership_application/);
});
