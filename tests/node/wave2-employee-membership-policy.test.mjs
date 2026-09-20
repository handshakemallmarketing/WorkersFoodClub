import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../../packages/durability/sql/021_employee_membership_entitlement.sql',import.meta.url),'utf8');

test('active-employee membership sponsorship is durably represented as zero-fee entitlement',()=>{
  assert.match(sql,/EMPLOYEE_SPONSORED/);
  assert.match(sql,/annual_fee_minor bigint NOT NULL DEFAULT 0/);
  assert.match(sql,/CHECK \(annual_fee_minor = 0\)/);
  assert.match(sql,/employment_evidence_id text NOT NULL/);
});

test('employment and membership remain separate state machines',()=>{
  assert.match(sql,/employment_record_id text NOT NULL/);
  assert.match(sql,/membership_id text REFERENCES application_membership/);
  assert.doesNotMatch(sql,/ALTER TABLE application_membership.*employment/s);
  assert.doesNotMatch(sql,/UPDATE application_membership/s);
});

test('entitlement lifecycle is explicit and auditable',()=>{
  assert.match(sql,/ELIGIBLE','GRANTED','REVOKED/);
  assert.match(sql,/GRANTED' AND membership_id IS NOT NULL AND granted_at IS NOT NULL/);
  assert.match(sql,/REVOKED' AND revoked_at IS NOT NULL/);
  assert.match(sql,/employee_membership_entitlement_employment_uq/);
});
