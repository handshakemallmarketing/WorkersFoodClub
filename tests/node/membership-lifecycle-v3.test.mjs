import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../packages/durability/sql/019_membership_lifecycle_v3.sql', import.meta.url), 'utf8');

test('primary membership can exist while inactive pending annual fee', () => {
  assert.match(sql, /'INACTIVE','ACTIVE','SUSPENDED','ENDED'/);
  assert.match(sql, /INITIAL_FEE_DUE/);
  assert.match(sql, /membership_subscription_invoice/);
});

test('annual subscription settlement is represented by a specific invoice', () => {
  assert.match(sql, /UNIQUE \(membership_id, subscription_year\)/);
  assert.match(sql, /state IN \('OPEN','PAID','VOID'\)/);
  assert.match(sql, /settlement_evidence_id/);
});

test('household beneficiary pending activation is distinct from primary approval', () => {
  assert.match(sql, /HOUSEHOLD_BENEFICIARY/);
  assert.match(sql, /household_beneficiary_invitation/);
  assert.match(sql, /APPROVED_PENDING_ACTIVATION/);
  assert.match(sql, /sponsoring_membership_id/);
});

test('past due and suspended standing are explicit', () => {
  assert.match(sql, /'CURRENT','PAST_DUE','SUSPENDED'/);
  assert.match(sql, /suspended_at/);
});
