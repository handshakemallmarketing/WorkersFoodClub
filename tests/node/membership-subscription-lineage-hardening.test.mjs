import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../../packages/durability/sql/037_membership_subscription_evidence_hardening.sql',import.meta.url),'utf8');

test('installs subscription hardening atomically under bounded locks',()=>{
  assert.match(migration,/BEGIN;[\s\S]*LOCK TABLE electronic_payment_evidence,[\s\S]*membership_subscription_settlement_allocation[\s\S]*IN SHARE ROW EXCLUSIVE MODE;[\s\S]*COMMIT;/);
  assert.match(migration,/paid subscription invoice is missing exact durable settlement lineage/);
  assert.match(migration,/subscription payment evidence history is not exactly reconciled/);
  assert.match(migration,/orphan subscription payment evidence consumption requires reconciliation/);
});

test('replacement settlement function fails closed on nullable or future evidence',()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION settle_membership_subscription/);
  assert.match(migration,/is_initial_settlement/);
  assert.match(migration,/is_renewal_settlement/);
  assert.match(migration,/ev\.state IS DISTINCT FROM 'RECONCILED'/);
  assert.match(migration,/ev\.reconciled_at IS NULL/);
  assert.match(migration,/ev\.reconciled_at>settled_at/);
  assert.match(migration,/ev\.membership_id IS DISTINCT FROM inv\.membership_id/);
  assert.match(migration,/ev\.obligation_id IS DISTINCT FROM inv\.invoice_id/);
  assert.match(migration,/ev\.amount_minor IS DISTINCT FROM inv\.amount_minor/);
  assert.match(migration,/ev\.currency IS DISTINCT FROM inv\.currency/);
  assert.match(migration,/other_due\.state='OPEN' AND other_due\.due_at<=settled_at/);
});

test('settled subscription lineage is immutable and cannot be fabricated',()=>{
  assert.match(migration,/consumed subscription payment evidence is immutable/);
  assert.match(migration,/subscription_consumption_immutable_trg/);
  assert.match(migration,/subscription_settlement_allocation_immutable_trg/);
  assert.match(migration,/paid subscription requires exact durable settlement lineage/);
  assert.match(migration,/paid_subscription_insert_lineage_trg/);
  assert.match(migration,/paid subscription settlement is immutable/);
  assert.match(migration,/c\.consumed_at=NEW\.paid_at/);
  assert.match(migration,/e\.reconciled_at<=NEW\.paid_at/);
});

test('scope excludes unratified credit, repayment, payroll and global identity policy',()=>{
  for (const forbidden of [
    'item_credit_receivable',
    'item_credit_repayment_allocation',
    'cag_deduction_enrollment',
    'ITEM_CREDIT_',
    'outstanding_minor',
    'deposit_minor',
    'electronic_payment_evidence_provider_event_normalized_uq',
  ]) assert.doesNotMatch(migration,new RegExp(forbidden));
});
