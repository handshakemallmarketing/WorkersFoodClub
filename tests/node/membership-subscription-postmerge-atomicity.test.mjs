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
  assert.match(migration,/CREATE OR REPLACE FUNCTION simulate_and_settle_membership_subscription/);
  assert.match(migration,/SELECT \* INTO inv[\s\S]*FOR UPDATE/);
  assert.match(migration,/INSERT INTO electronic_payment_evidence/);
  assert.match(migration,/RETURN QUERY[\s\S]*settle_membership_subscription/);
  assert.match(migration,/GET DIAGNOSTICS changed=ROW_COUNT/);
  assert.match(migration,/sandbox subscription settlement rejected after evidence synthesis/);
  assert.match(endpoint,/SELECT \* FROM simulate_and_settle_membership_subscription/);
  assert.doesNotMatch(endpoint,/WITH evidence AS/);
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
