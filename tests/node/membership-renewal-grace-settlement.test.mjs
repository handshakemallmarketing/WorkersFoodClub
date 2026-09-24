import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../../packages/durability/sql/036_membership_renewal_grace_settlement.sql', import.meta.url), 'utf8');

test('settle_membership_subscription now recognizes a renewal settlement precondition alongside the original initial-settlement one', () => {
  assert.match(migration, /is_initial_settlement := mem\.state='INACTIVE' AND mem\.standing='INITIAL_FEE_DUE'/);
  assert.match(migration, /is_renewal_settlement := mem\.state='ACTIVE' AND mem\.standing IN \('GRACE','RESTRICTED'\)/);
  assert.match(migration, /NOT \(is_initial_settlement OR is_renewal_settlement\)/);
});

test('renewal settlement restores ACTIVE standing and clears the grace window without touching activated_at/suspended_at', () => {
  assert.match(migration, /SET standing='ACTIVE',\s*\n\s*grace_started_at=NULL,grace_ends_at=NULL/);
  assert.doesNotMatch(migration, /grace_started_at=NULL,grace_ends_at=NULL[\s\S]{0,80}activated_at/);
});

test('renewal settlement still requires the exact same evidence lineage checks as the original branch (no separate, weaker path)', () => {
  assert.match(migration, /ev\.state<>'RECONCILED'/);
  assert.match(migration, /ev\.membership_id<>inv\.membership_id/);
  assert.match(migration, /ev\.amount_minor<>inv\.amount_minor/);
});

test('generic SUSPENDED standing still cannot be cleared by payment settlement (renewal branch is GRACE/RESTRICTED only)', () => {
  assert.doesNotMatch(migration, /standing IN \('GRACE','RESTRICTED','SUSPENDED'\)/);
  assert.doesNotMatch(migration, /mem\.standing='SUSPENDED'/);
});

test('the settlement audit event distinguishes a renewal from the original initial settlement', () => {
  assert.match(migration, /MEMBERSHIP_RENEWAL_SETTLED/);
  assert.match(migration, /CASE WHEN is_initial_settlement THEN 'MEMBERSHIP_SUBSCRIPTION_SETTLED' ELSE 'MEMBERSHIP_RENEWAL_SETTLED' END/);
});

test('the idempotent-replay and locking behavior from the original function is preserved verbatim', () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /IF inv\.state='PAID' THEN/);
  assert.match(migration, /idempotent:=true/);
});
