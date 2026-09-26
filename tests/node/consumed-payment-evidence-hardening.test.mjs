import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../../packages/durability/sql/037_consumed_payment_evidence_hardening.sql',import.meta.url),'utf8');

test('preflight and enforcement install under one locked transaction',()=>{
  assert.match(migration,/BEGIN;[\s\S]*LOCK TABLE electronic_payment_evidence,[\s\S]*IN SHARE ROW EXCLUSIVE MODE;[\s\S]*COMMIT;/);
  assert.match(migration,/item_credit_repayment_allocation,\s*cag_deduction_enrollment\s*IN SHARE ROW EXCLUSIVE MODE/);
});

test('provider event identity is normalized before uniqueness enforcement',()=>{
  assert.match(migration,/GROUP BY rail, lower\(btrim\(provider_reference\)\)/);
  assert.match(migration,/electronic_payment_evidence_provider_event_normalized_uq/);
  assert.match(migration,/ON electronic_payment_evidence\(rail, lower\(btrim\(provider_reference\)\)\)/);
});

test('credit claims require exact reconciled economic lineage',()=>{
  assert.match(migration,/e\.membership_id=NEW\.membership_id/);
  assert.match(migration,/e\.obligation_id=NEW\.offer_id/);
  assert.match(migration,/e\.state='RECONCILED' AND e\.reconciled_at IS NOT NULL/);
  assert.match(migration,/e\.reconciled_at<=now\(\)/);
  assert.match(migration,/e\.amount_minor=NEW\.deposit_minor/);
  assert.match(migration,/d\.enrollment_id=NEW\.enrollment_id/);
  assert.match(migration,/d\.membership_id=NEW\.membership_id/);
  assert.match(migration,/e\.obligation_id=NEW\.receivable_id/);
  assert.match(migration,/e\.amount_minor=NEW\.amount_minor/);
});

test('nullable legacy comparisons fail closed',()=>{
  assert.match(migration,/e\.obligation_id IS DISTINCT FROM r\.offer_id/);
  assert.match(migration,/e\.obligation_id IS DISTINCT FROM r\.receivable_id/);
});

test('latest renewal-capable settlement function rejects nullable lineage',()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION settle_membership_subscription/);
  assert.match(migration,/is_renewal_settlement/);
  assert.match(migration,/ev\.membership_id IS DISTINCT FROM inv\.membership_id/);
  assert.match(migration,/ev\.obligation_id IS DISTINCT FROM inv\.invoice_id/);
  assert.match(migration,/ev\.amount_minor IS DISTINCT FROM inv\.amount_minor/);
  assert.match(migration,/ev\.currency IS DISTINCT FROM inv\.currency/);
  assert.match(migration,/ev\.reconciled_at>settled_at/);
  assert.match(migration,/other_due\.state='OPEN' AND other_due\.due_at<=settled_at/);
  assert.match(migration,/other_due\.invoice_id<>inv\.invoice_id/);
});

test('consumed evidence, claims and paid invoices are immutable',()=>{
  assert.match(migration,/reject_consumed_payment_evidence_mutation/);
  assert.match(migration,/BEFORE UPDATE OF evidence_id,membership_id,obligation_id,rail,state,reconciled_at,amount_minor,currency,provider_reference,created_at/);
  assert.match(migration,/BEFORE DELETE ON electronic_payment_evidence/);
  assert.match(migration,/payment_evidence_consumption_immutable_trg/);
  assert.match(migration,/subscription_settlement_allocation_immutable_trg/);
  assert.match(migration,/paid subscription settlement is immutable/);
  assert.match(migration,/settlement_evidence_id,created_at ON membership_subscription_invoice/);
  assert.match(migration,/claimed credit receivable binding is immutable/);
  assert.match(migration,/BEFORE UPDATE OF receivable_id,membership_id,offer_id,principal_minor,deposit_minor,deposit_evidence_id,enrollment_id,created_at/);
  assert.match(migration,/credit_repayment_allocation_immutable_trg/);
  assert.match(migration,/claimed credit payroll authority is immutable/);
  assert.match(migration,/BEFORE UPDATE OF enrollment_id,membership_id,mandate_reference,enrolled_at/);
});

test('migration refuses contradictory or orphan historical claims',()=>{
  assert.match(migration,/subscription payment evidence history is not exactly reconciled/);
  assert.match(migration,/paid subscription invoice is missing exact durable settlement lineage/);
  assert.match(migration,/credit deposit evidence history is not exactly reconciled/);
  assert.match(migration,/credit repayment evidence history is not exactly reconciled/);
  assert.match(migration,/orphan payment evidence consumption requires reconciliation/);
  assert.match(migration,/i\.paid_at IS DISTINCT FROM a\.allocated_at/);
  assert.match(migration,/i\.paid_at IS DISTINCT FROM c\.consumed_at/);
  assert.match(migration,/e\.reconciled_at > i\.paid_at/);
  assert.match(migration,/c\.consumed_at IS DISTINCT FROM r\.created_at/);
  assert.match(migration,/d\.membership_id IS DISTINCT FROM r\.membership_id/);
  assert.match(migration,/c\.consumed_at IS DISTINCT FROM a\.allocated_at/);
});

test('new PAID invoices require exact pre-existing allocation and consumption lineage',()=>{
  assert.match(migration,/paid subscription requires exact durable settlement lineage/);
  assert.match(migration,/paid_subscription_insert_lineage_trg/);
  assert.match(migration,/a\.allocated_at=NEW\.paid_at/);
  assert.match(migration,/c\.consumed_at=NEW\.paid_at/);
});
