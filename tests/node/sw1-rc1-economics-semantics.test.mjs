import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {GovernedMemberEconomicsService} from '../../dist/packages/pilot-member-economics/src/index.js';

const id=x=>asId(x),pid=id,oid=id,sid=id,eid=id;
const member=pid('participant:rc1-fraction-member');
const club=pid('participant:food-club');
const obligationId=oid('obligation:rc1-fraction');
const spec=sid('spec:rice:rc1');
const offerId=oid('offer:rc1-fraction');
const acceptedAt='2026-09-10T08:17:00Z';
const offerValidity={validFrom:'2026-09-10T08:10:00Z',validUntil:'2026-09-11T12:00:00Z'};
const benchmark=Object.freeze({
 id:'benchmark-display:rc1-fraction',
 specificationId:spec,
 priceEvidenceId:eid('evidence:rc1-fraction-market'),
 value:money(60000n,'GHS'),
 basis:quantity(5,'kg'),
 place:'Accra Retail',
 observedAt:'2026-09-10T08:06:00Z',
 transactionLevel:'RETAIL',
 conditions:Object.freeze(['cash']),
 methodVersion:'retail-reference-v1',
 disclaimer:'REFERENCE_ONLY_NOT_FINAL_SAVINGS'
});
const commitment=Object.freeze({
 obligation:Object.freeze({id:obligationId,obligor:member,beneficiary:club,specificationId:spec,quantity:quantity(5,'kg'),state:'OPEN'}),
 participantId:member,
 membershipId:'membership:rc1-fraction',
 offerId,
 committedMemberPrice:money(50000n,'GHS'),
 committedPriceBasis:quantity(5,'kg'),
 committedPickupPlace:'pickup:rc1',
 authorizedCommandId:id('command:rc1-fraction'),
 authorizedEventId:'event:rc1-fraction',
 acceptedAt,
 policyVersions:Object.freeze(['checkout-v1'])
});

function setup(){
 const economics=new InMemoryEconomicsLedger();
 const resolution=new InMemoryObligationResolutionLedger();
 resolution.recordPerformed('acceptance:rc1-fraction',{id:obligationId,quantity:quantity(5,'kg')},quantity(4.5,'kg'));
 const payment=Object.freeze({evidenceId:eid('evidence:rc1-fraction-payment'),obligationId,provider:'SANDBOX_MOMO',providerReference:'provider:rc1-fraction',amount:money(50000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-10T08:19:00Z',recordedAt:'2026-09-10T08:20:00Z'});
 const demand={getCommitment:id=>id===obligationId?commitment:undefined,paymentsFor:id=>id===obligationId?[payment]:[]};
 const catalog={
  catalogView:input=>{
   assert.equal(input.at,acceptedAt,'benchmark lookup must use canonical commitment time');
   assert.equal(input.offerId,offerId);
   return Object.freeze({listing:Object.freeze({listingId:'listing:rc1-rice',specificationId:spec,active:true}),offer:Object.freeze({id:offerId,...offerValidity}),benchmark,promise:Object.freeze({}),specification:Object.freeze({id:spec,version:1})});
  },
  benchmarkForOffer:id=>id===offerId?benchmark:undefined
 };
 return {economics,resolution,demand,catalog,service:new GovernedMemberEconomicsService(demand,resolution,economics,undefined,catalog)};
}

test('SW1-RC1 governed savings ignores caller timing semantics and exactly prorates fractional fulfilled quantity',()=>{
 const {service}=setup();
 const result=service.recordGovernedSavingsBenchmark({
  benchmarkId:'benchmark:rc1-fraction',benchmarkVersion:1,valuationId:'valuation:rc1-fraction',obligationId,listingId:'listing:rc1-rice',offerId,benchmarkDisplayId:benchmark.id,
  catalogAt:'1999-01-01T00:00:00Z',validFrom:'1999-01-01T00:00:00Z',validUntil:'2099-12-31T23:59:59Z',serviceLevel:'fabricated',availabilityRuleVersion:'fabricated',evaluatedAt:'2099-01-01T00:00:00Z'
 });
 assert.equal(result.method.validFrom,offerValidity.validFrom);
 assert.equal(result.method.validUntil,offerValidity.validUntil);
 assert.equal(result.method.definedAt,acceptedAt);
 assert.equal(result.method.serviceLevel,'pickup');
 assert.equal(result.method.availabilityRuleVersion,'catalog-offer-executable-v1');
 assert.equal(result.valuation.evaluatedAt,acceptedAt);
 assert.equal(result.valuation.quantity.amount,4.5);
 assert.equal(result.valuation.comparableValue.minor,54000n);
});

test('SW1-RC1 fulfilled economics comparison context cannot be caller-colluded',()=>{
 const {service}=setup();
 const base={id:'member-econ:rc1-fraction',obligationId,participantId:member,specificationId:spec,quantity:quantity(4.5,'kg'),place:benchmark.place,serviceLevel:'pickup',goodsOutlay:money(50000n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('evidence:rc1-fraction-payment')],realizedAt:'2026-09-10T08:51:00Z',substitutionEvidenceIds:[]};
 assert.throws(()=>service.recordFulfilledEconomics({...base,id:'member-econ:rc1-bad-place',place:'Caller Fabricated Market'}),/MEMBER_ECONOMICS_COMPARISON_CONTEXT_NOT_CANONICAL/);
 assert.throws(()=>service.recordFulfilledEconomics({...base,id:'member-econ:rc1-bad-service',serviceLevel:'delivery'}),/MEMBER_ECONOMICS_COMPARISON_CONTEXT_NOT_CANONICAL/);
 assert.doesNotThrow(()=>service.recordFulfilledEconomics(base));
});
