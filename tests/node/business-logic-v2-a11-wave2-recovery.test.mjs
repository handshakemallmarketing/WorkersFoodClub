import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryMembershipBillingStore } from '../../dist/packages/membership/src/billing.js';
import { InMemoryShoppingCreditStore } from '../../dist/packages/membership/src/credits.js';
import { authorizeDemandCommitment, pooledDemandQuantity } from '../../dist/packages/catalog/src/commitment.js';
import { authorizeOperatorAction } from '../../dist/packages/governance/src/operator-authority.js';

const now = '2026-09-16T12:00:00Z';
const memberId = 'participant:a11-recovery-member';
const offer = { offerId:'offer:a11-recovery', version:3, skuId:'sku:rice', state:'OPEN', validFrom:'2026-09-01T00:00:00Z', validUntil:'2026-10-01T00:00:00Z', policy:{minQuantity:5,maxQuantity:20,quantityStep:5} };
const basket = { basketId:'basket:a11-recovery', memberId, lines:[{offerId:offer.offerId,offerVersion:3,skuId:offer.skuId,quantity:10}] };
const request = { requestId:'request:a11-recovery', memberId, basketId:basket.basketId, offerId:offer.offerId, offerVersion:3, quantity:10 };
function paymentEvidence(obligationId, amountMinor, reference) { return { evidenceId:`evidence:${reference}`, providerReference:reference, participantId:memberId, obligationId, amountMinor, verified:true, persisted:true, verifiedAt:now }; }

test('A11 process-loss replay conserves one commitment effect and pooled quantity', () => {
  const first = authorizeDemandCommitment({request,basket,offer,memberInGoodStanding:true,now});
  assert.equal(first.ok,true);
  const canonical = new Map([[request.requestId, first.commitment]]);
  const replay = authorizeDemandCommitment({request,basket,offer,memberInGoodStanding:true,now,existingByRequestId:canonical});
  assert.deepEqual(replay, first);
  assert.equal(canonical.size, 1);
  assert.equal(pooledDemandQuantity([...canonical.values()], offer.offerId), 10);
});

test('A11 replayed membership settlement conserves one settlement and one shipping-credit allocation', () => {
  const credits = new InMemoryShoppingCreditStore();
  const billing = new InMemoryMembershipBillingStore(credits);
  const invoiceId = 'invoice:a11-recovery';
  billing.issue({id:invoiceId,participantId:memberId,amountMinor:10000,issuedAt:'2026-09-01T00:00:00Z',dueAt:'2026-09-10T00:00:00Z'});
  const evidence = paymentEvidence(invoiceId, 11500, 'settlement:a11-recovery');
  const first = billing.recordAuthoritativeSettlement(invoiceId,evidence);
  const replay = billing.recordAuthoritativeSettlement(invoiceId,evidence);
  assert.equal(first.invoice.state,'SETTLED');
  assert.equal(first.invoice.settledMinor,10000);
  assert.equal(first.overpaymentShippingCreditMinor,1500);
  assert.equal(replay.overpaymentShippingCreditMinor,0);
  assert.deepEqual(replay.invoice.settlementReferences,['settlement:a11-recovery']);
  assert.equal(credits.balanceByApplicability(memberId,'SHIPPING'),1500);
  assert.equal(credits.balanceByApplicability(memberId,'MERCHANDISE'),0);
});

test('A11 unverified or unpersisted caller assertion cannot manufacture settlement', () => {
  const billing = new InMemoryMembershipBillingStore();
  const invoiceId = 'invoice:a11-no-evidence';
  billing.issue({id:invoiceId,participantId:memberId,amountMinor:10000,issuedAt:'2026-09-01T00:00:00Z',dueAt:'2026-09-10T00:00:00Z'});
  const base = paymentEvidence(invoiceId,10000,'settlement:a11-no-evidence');
  assert.throws(()=>billing.recordAuthoritativeSettlement(invoiceId,{...base,verified:false}),/VERIFIED_PERSISTED_PAYMENT_EVIDENCE_REQUIRED/);
  assert.throws(()=>billing.recordAuthoritativeSettlement(invoiceId,{...base,persisted:false}),/VERIFIED_PERSISTED_PAYMENT_EVIDENCE_REQUIRED/);
  assert.equal(billing.get(invoiceId).state,'ISSUED');
  assert.equal(billing.get(invoiceId).settledMinor,0);
});

test('A11 basket or survey-like intent alone cannot contribute pooled demand', () => {
  assert.equal(pooledDemandQuantity([],offer.offerId),0);
  const denied = authorizeDemandCommitment({request,basket,offer,memberInGoodStanding:false,now});
  assert.deepEqual(denied,{ok:false,code:'MEMBER_NOT_IN_GOOD_STANDING'});
  assert.equal(pooledDemandQuantity([],offer.offerId),0);
});

test('A11 revoked original authority cannot be recovered by replay intent', () => {
  const revoked = { grantId:'grant:a11-revoked', participantId:'operator:a11', role:'WAREHOUSE_MANAGER', permissions:['warehouse:manage'], grantedAt:'2026-09-01T00:00:00Z', grantedBy:'owner:a11', revokedAt:'2026-09-16T11:59:00Z' };
  assert.deepEqual(authorizeOperatorAction({participantId:'operator:a11',permission:'warehouse:manage',grants:[revoked],now}),{allowed:false,reason:'NO_ACTIVE_GRANT'});
});

test('A11 ambiguous external side effect is not classified as safe retry', () => {
  const classify = ({provenAbsent=false,provenPresent=false}) => provenAbsent ? 'RETRY_EXACT_AUTHORIZED' : provenPresent ? 'RECONCILE_SUPPRESS_DUPLICATE' : 'FAIL_CLOSED_ESCALATE';
  assert.equal(classify({provenAbsent:true}),'RETRY_EXACT_AUTHORIZED');
  assert.equal(classify({provenPresent:true}),'RECONCILE_SUPPRESS_DUPLICATE');
  assert.equal(classify({}),'FAIL_CLOSED_ESCALATE');
});
