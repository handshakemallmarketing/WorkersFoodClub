import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../../packages/durability/sql/032_membership_subscription_evidence_atomicity.sql',import.meta.url),'utf8');

test('subscription settlement requires exact reconciled evidence lineage',()=>{
 assert.match(migration,/ev\.state<>'RECONCILED'/);
 assert.match(migration,/ev\.reconciled_at IS NULL/);
 assert.match(migration,/ev\.membership_id<>inv\.membership_id/);
 assert.match(migration,/ev\.obligation_id<>inv\.invoice_id/);
 assert.match(migration,/ev\.amount_minor<>inv\.amount_minor/);
 assert.match(migration,/ev\.currency<>inv\.currency/);
 assert.match(migration,/ev\.provider_reference IS NULL/);
});
test('one durable ledger excludes evidence reuse across subscription and credit consumers',()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS electronic_payment_evidence_consumption/);
 assert.match(migration,/evidence_id text PRIMARY KEY/);
 assert.match(migration,/ITEM_CREDIT_DEPOSIT/);
 assert.match(migration,/ITEM_CREDIT_REPAYMENT/);
 assert.match(migration,/MEMBERSHIP_SUBSCRIPTION/);
 assert.match(migration,/claim_credit_payment_evidence/);
});
test('generic suspension cannot be cleared by payment settlement',()=>{
 assert.doesNotMatch(migration,/mem\.state='SUSPENDED'/);
 assert.match(migration,/mem\.state='INACTIVE' AND mem\.standing='INITIAL_FEE_DUE'/);
 assert.doesNotMatch(migration,/mem\.state='ACTIVE' AND mem\.standing='INITIAL_FEE_DUE'/);
});
test('settlement requires the exact authenticated member session and unique provider event',()=>{
 assert.match(migration,/requested_session_id text/);
 assert.match(migration,/s\.membership_id=mem\.membership_id/);
 assert.match(migration,/s\.participant_id=mem\.participant_id/);
 assert.match(migration,/s\.state='ACTIVE' AND s\.expires_at>settled_at/);
 assert.match(migration,/electronic_payment_evidence_provider_event_uq/);
 assert.match(migration,/GROUP BY rail,provider_reference HAVING count\(\*\) > 1/);
});
test('invoice, membership, allocation, consumption and audit execute in one database function',()=>{
 assert.match(migration,/CREATE OR REPLACE FUNCTION settle_membership_subscription/);
 assert.match(migration,/FOR UPDATE/);
 assert.match(migration,/INSERT INTO membership_subscription_settlement_allocation/);
 assert.match(migration,/UPDATE membership_subscription_invoice/);
 assert.match(migration,/UPDATE application_membership/);
 assert.match(migration,/INSERT INTO application_access_audit/);
});
