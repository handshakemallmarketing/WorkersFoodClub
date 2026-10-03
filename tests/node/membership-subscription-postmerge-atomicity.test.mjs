import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../../packages/durability/sql/038_membership_subscription_sandbox_atomicity.sql',import.meta.url),'utf8');
const replayMigration=fs.readFileSync(new URL('../../packages/durability/sql/039_membership_subscription_sandbox_request_replay.sql',import.meta.url),'utf8');
const endpoint=fs.readFileSync(new URL('../../api/membership-subscription-pay-sandbox.js',import.meta.url),'utf8');
const memberUi=fs.readFileSync(new URL('../../public/member-auth.js',import.meta.url),'utf8');

test('migration rejects every contradictory historical paid-state marker',()=>{
  assert.match(migration,/i\.state='PAID' OR i\.paid_at IS NOT NULL OR i\.settlement_evidence_id IS NOT NULL/);
  assert.match(migration,/subscription invoice has contradictory historical paid state/);
});

test('Preview evidence synthesis and settlement share one rollback boundary',()=>{
  assert.match(endpoint,/sql\.transaction\(\[/);
  assert.match(endpoint,/INSERT INTO electronic_payment_evidence/);
  assert.match(endpoint,/SELECT \* FROM settle_membership_subscription/);
  assert.match(endpoint,/membership_subscription_settlement_allocation/);
  assert.match(endpoint,/membership_subscription_sandbox_request_state_ck/);
  assert.doesNotMatch(migration,/simulate_and_settle_membership_subscription/);
});

test('Preview request replay is durably bound and rebound fails closed',()=>{
  assert.match(replayMigration,/request_id text PRIMARY KEY/);
  assert.match(replayMigration,/membership_id text NOT NULL/);
  assert.match(replayMigration,/invoice_id text NOT NULL/);
  assert.match(replayMigration,/evidence_id text NOT NULL UNIQUE/);
  assert.match(replayMigration,/provider_reference text NOT NULL UNIQUE/);
  assert.match(replayMigration,/DEFERRABLE INITIALLY DEFERRED/);
  assert.match(replayMigration,/state text NOT NULL DEFAULT 'PENDING'/);
  assert.match(replayMigration,/state='COMMITTED'/);
  assert.match(replayMigration,/membership_subscription_sandbox_request_completion_ck/);
  assert.match(replayMigration,/committed subscription sandbox request is immutable/);
  assert.match(replayMigration,/committed subscription sandbox request lineage is invalid/);
  assert.match(replayMigration,/membership_subscription_settlement_allocation/);
  assert.match(replayMigration,/electronic_payment_evidence_consumption/);
  assert.match(replayMigration,/MEMBERSHIP_RENEWAL_SETTLED/);
  assert.match(endpoint,/ON CONFLICT DO NOTHING/);
  assert.match(endpoint,/SELECT request_id FROM membership_subscription_sandbox_request/);
  assert.match(endpoint,/ON CONFLICT \(evidence_id\) DO NOTHING/);
  assert.match(endpoint,/COALESCE\(r\.completed_at/);
  assert.match(endpoint,/PAYMENT_RAIL_INVALID/);
  assert.match(memberUi,/crypto\.randomUUID\(\)/);
  assert.match(memberUi,/localStorage\.getItem/);
  assert.match(memberUi,/DURABLE_REQUEST_ID_STORAGE_UNAVAILABLE/);
  assert.match(memberUi,/'X-Request-ID': sandboxRequestId\(invoiceId\)/);
});

test('scope remains Preview-only and excludes blocked economic and authority surfaces',()=>{
  assert.match(endpoint,/SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION/);
  for(const forbidden of [
    'item_credit_receivable',
    'item_credit_repayment_allocation',
    'cag_deduction_enrollment',
    'PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA',
  ]) assert.doesNotMatch(migration,new RegExp(forbidden));
  for(const forbidden of ['item_credit_receivable','PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA']) {
    assert.doesNotMatch(replayMigration,new RegExp(forbidden));
  }
});
