import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../../packages/durability/sql/038_membership_subscription_sandbox_atomicity.sql',import.meta.url),'utf8');
const endpoint=fs.readFileSync(new URL('../../api/membership-subscription-pay-sandbox.js',import.meta.url),'utf8');

test('migration rejects every contradictory historical paid-state marker',()=>{
  assert.match(migration,/i\.state='PAID' OR i\.paid_at IS NOT NULL OR i\.settlement_evidence_id IS NOT NULL/);
  assert.match(migration,/subscription invoice has contradictory historical paid state/);
});

test('Preview evidence synthesis and settlement share one rollback boundary',()=>{
  assert.match(endpoint,/sql\.transaction\(\[/);
  assert.match(endpoint,/INSERT INTO electronic_payment_evidence/);
  assert.match(endpoint,/SELECT \* FROM settle_membership_subscription/);
  assert.match(endpoint,/membership_subscription_settlement_allocation/);
  assert.match(endpoint,/count\(\*\)::integer/);
  assert.match(endpoint,/error\?\.code === '22012'/);
  assert.doesNotMatch(migration,/simulate_and_settle_membership_subscription/);
});

test('scope remains Preview-only and excludes blocked economic and authority surfaces',()=>{
  assert.match(endpoint,/SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION/);
  for(const forbidden of [
    'item_credit_receivable',
    'item_credit_repayment_allocation',
    'cag_deduction_enrollment',
    'PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA',
  ]) assert.doesNotMatch(migration,new RegExp(forbidden));
});
