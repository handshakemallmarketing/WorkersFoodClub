import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,money,quantity} from '../../dist/packages/kernel/src/index.js';
import {InMemoryDemandCommitmentLedger} from '../../dist/packages/demand/src/index.js';

const pid=x=>asId(x), sid=x=>asId(x), oid=x=>asId(x), ofid=x=>asId(x), eid=x=>asId(x), cid=x=>asId(x);
const verifier={isAccepted:(commandId,eventId)=>commandId==='command:checkout'&&eventId==='event:purchase-accepted'};
const ledger=()=>new InMemoryDemandCommitmentLedger(verifier);

const member={id:'membership:1',participantId:pid('participant:member'),state:'ACTIVE',establishedAt:'2026-09-01T00:00:00Z',eligibilityPolicyVersion:'worker-v1',eligibilityEvidenceIds:[eid('evidence:eligibility')]};
const offer={id:ofid('offer:rice'),offerorId:pid('participant:food-club'),specificationId:sid('spec:rice-5kg'),quantity:quantity(5,'kg'),memberPrice:money(45000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'hospital:korle-bu',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',priceEvidenceIds:[eid('evidence:price')],policyVersions:['pricing:v1']};
const commitInput=(overrides={})=>({obligationId:oid('obligation:1'),participantId:member.participantId,membership:member,offer,quantity:quantity(5,'kg'),authorizedCommandId:cid('command:checkout'),authorizedEventId:'event:purchase-accepted',acceptedAt:'2026-09-07T10:00:00Z',policyVersions:['checkout:v1'],...overrides});

test('INV-003 forecast interest and request remain signals and do not create commitment',()=>{
 const l=ledger(); l.recordSignal({id:'demand:forecast',participantId:member.participantId,specificationId:offer.specificationId,quantity:quantity(10,'kg'),kind:'FORECAST',observedAt:'2026-09-07T09:00:00Z',evidenceIds:[]});
 assert.ok(l.getSignal('demand:forecast')); assert.equal(l.getCommitment(oid('obligation:1')),undefined);
});

test('INV-004 purchase obligation requires verifiably accepted command/event and active membership',async()=>{
 const l=ledger();
 await assert.rejects(()=>l.commitPurchase(commitInput({authorizedEventId:''})),/AUTHORIZED_COMMITMENT_EVENT_REQUIRED/);
 await assert.rejects(()=>l.commitPurchase(commitInput({authorizedEventId:'event:forged'})),/AUTHORIZED_COMMITMENT_NOT_VERIFIED/);
 await assert.rejects(()=>l.commitPurchase(commitInput({membership:{...member,state:'SUSPENDED'}})),/PURCHASE_REQUIRES_ACTIVE_MEMBERSHIP/);
 const record=await l.commitPurchase(commitInput());
 assert.equal(record.obligation.state,'OPEN'); assert.equal(record.obligation.specificationId,offer.specificationId);
});

test('INV-003 demand signal may inform but cannot silently substitute for purchase commitment',async()=>{
 const l=ledger(); l.recordSignal({id:'demand:interest',participantId:member.participantId,specificationId:offer.specificationId,quantity:quantity(5,'kg'),kind:'INTEREST',observedAt:'2026-09-07T09:00:00Z',evidenceIds:[eid('evidence:survey')]});
 const record=await l.commitPurchase(commitInput({sourceDemandSignalId:'demand:interest'}));
 assert.equal(record.sourceDemandSignalId,'demand:interest'); assert.equal(record.authorizedEventId,'event:purchase-accepted');
});

test('purchase commitment rejects stale offers and cross-specification demand',async()=>{
 const l=ledger();
 await assert.rejects(()=>l.commitPurchase(commitInput({acceptedAt:'2026-10-01T00:00:00Z'})),/OFFER_NOT_EXECUTABLE/);
 l.recordSignal({id:'demand:maize',participantId:member.participantId,specificationId:sid('spec:maize'),quantity:quantity(5,'kg'),kind:'REQUEST',observedAt:'2026-09-07T09:00:00Z',evidenceIds:[]});
 await assert.rejects(()=>l.commitPurchase(commitInput({sourceDemandSignalId:'demand:maize'})),/DEMAND_SIGNAL_SPECIFICATION_MISMATCH/);
});

test('payment confirmation is evidence and does not discharge fulfillment obligation',async()=>{
 const l=ledger(); const commitment=await l.commitPurchase(commitInput());
 l.recordPaymentEvidence({evidenceId:eid('evidence:payment-1'),obligationId:commitment.obligation.id,provider:'MTN_MOMO',providerReference:'TXN-1',amount:money(45000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-07T10:01:00Z',recordedAt:'2026-09-07T10:01:02Z'});
 assert.equal(l.getCommitment(commitment.obligation.id).obligation.state,'OPEN'); assert.equal(l.getPayment(eid('evidence:payment-1')).status,'CONFIRMED');
});

test('member prepayment remains restricted and is not earned revenue or unrestricted capital',async()=>{
 const l=ledger(); const commitment=await l.commitPurchase(commitInput());
 l.recordPaymentEvidence({evidenceId:eid('evidence:payment-2'),obligationId:commitment.obligation.id,provider:'MTN_MOMO',providerReference:'TXN-2',amount:money(45000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-07T10:01:00Z',recordedAt:'2026-09-07T10:01:02Z'});
 assert.deepEqual(l.paymentTreatment(eid('evidence:payment-2')),{earnedRevenue:false,unrestrictedCapital:false,classification:'RESTRICTED_MEMBER_PREPAYMENT',linkedObligationId:commitment.obligation.id});
});

test('payment provider references are effect-unique evidence identities',async()=>{
 const l=ledger(); const commitment=await l.commitPurchase(commitInput());
 l.recordPaymentEvidence({evidenceId:eid('evidence:payment-a'),obligationId:commitment.obligation.id,provider:'MTN_MOMO',providerReference:'TXN-3',amount:money(45000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-07T10:01:00Z',recordedAt:'2026-09-07T10:01:02Z'});
 assert.throws(()=>l.recordPaymentEvidence({evidenceId:eid('evidence:payment-b'),obligationId:commitment.obligation.id,provider:'MTN_MOMO',providerReference:'TXN-3',amount:money(45000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-07T10:01:00Z',recordedAt:'2026-09-07T10:01:02Z'}),/PAYMENT_PROVIDER_REFERENCE_DUPLICATE/);
});
