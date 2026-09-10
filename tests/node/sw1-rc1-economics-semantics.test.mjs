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

function setup({performed=4.5,committed=5,basis=5,observedAt='2026-09-10T08:06:00Z',benchmarkMinor=60000n}={}){
 const benchmark=Object.freeze({
  id:'benchmark-display:rc1-fraction',specificationId:spec,priceEvidenceId:eid('evidence:rc1-fraction-market'),value:money(benchmarkMinor,'GHS'),basis:quantity(basis,'kg'),place:'Accra Retail',observedAt,transactionLevel:'RETAIL',conditions:Object.freeze(['cash']),methodVersion:'retail-reference-v1',disclaimer:'REFERENCE_ONLY_NOT_FINAL_SAVINGS'
 });
 const commitment=Object.freeze({
  obligation:Object.freeze({id:obligationId,obligor:member,beneficiary:club,specificationId:spec,quantity:quantity(committed,'kg'),state:'OPEN'}),participantId:member,membershipId:'membership:rc1-fraction',offerId,committedMemberPrice:money(50000n,'GHS'),committedPriceBasis:quantity(committed,'kg'),committedPickupPlace:'pickup:rc1',authorizedCommandId:id('command:rc1-fraction'),authorizedEventId:'event:rc1-fraction',acceptedAt,policyVersions:Object.freeze(['checkout-v1'])
 });
 const economics=new InMemoryEconomicsLedger();
 const resolution=new InMemoryObligationResolutionLedger();
 resolution.recordPerformed('acceptance:rc1-fraction',{id:obligationId,quantity:quantity(committed,'kg')},quantity(performed,'kg'));
 const payment=Object.freeze({evidenceId:eid('evidence:rc1-fraction-payment'),obligationId,provider:'SANDBOX_MOMO',providerReference:'provider:rc1-fraction',amount:money(50000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-10T08:19:00Z',recordedAt:'2026-09-10T08:20:00Z'});
 const demand={getCommitment:id=>id===obligationId?commitment:undefined,paymentsFor:id=>id===obligationId?[payment]:[]};
 let historicalReads=0;
 const catalog={
  historicalOfferContext:(id,benchmarkDisplayId)=>{
   historicalReads++;
   assert.equal(id,offerId);
   assert.equal(benchmarkDisplayId,benchmark.id);
   return Object.freeze({offer:Object.freeze({id:offerId,specificationId:spec,quantity:quantity(committed,'kg'),...offerValidity}),benchmark,promise:Object.freeze({}),specification:Object.freeze({id:spec,version:1})});
  },
  benchmarkForOffer:id=>id===offerId?benchmark:undefined
 };
 return {economics,resolution,demand,catalog,benchmark,commitment,getHistoricalReads:()=>historicalReads,service:new GovernedMemberEconomicsService(demand,resolution,economics,undefined,catalog)};
}

test('SW1-RC1 governed savings uses immutable historical offer context and ignores caller timing semantics',()=>{
 const {service,benchmark,getHistoricalReads}=setup();
 const result=service.recordGovernedSavingsBenchmark({
  benchmarkId:'benchmark:rc1-fraction',benchmarkVersion:1,valuationId:'valuation:rc1-fraction',obligationId,listingId:'listing:now-inactive',offerId,benchmarkDisplayId:benchmark.id,
  catalogAt:'1999-01-01T00:00:00Z',validFrom:'1999-01-01T00:00:00Z',validUntil:'2099-12-31T23:59:59Z',serviceLevel:'fabricated',availabilityRuleVersion:'fabricated',evaluatedAt:'2099-01-01T00:00:00Z'
 });
 assert.equal(getHistoricalReads(),1,'historical valuation must not consult a live listing view');
 assert.equal(result.method.validFrom,offerValidity.validFrom);
 assert.equal(result.method.validUntil,offerValidity.validUntil);
 assert.equal(result.method.definedAt,acceptedAt);
 assert.equal(result.method.serviceLevel,'pickup');
 assert.equal(result.method.availabilityRuleVersion,'historical-committed-offer-v1');
 assert.equal(result.valuation.evaluatedAt,acceptedAt);
 assert.equal(result.valuation.quantity.amount,4.5);
 assert.equal(result.valuation.comparableValue.minor,54000n);
});

test('SW1-RC1 quantity normalization prevents binary float noise from changing money proration',()=>{
 const {service,benchmark}=setup({performed:0.1+0.7,committed:0.8,basis:0.8});
 const result=service.recordGovernedSavingsBenchmark({benchmarkId:'benchmark:rc1-float-noise',benchmarkVersion:1,valuationId:'valuation:rc1-float-noise',obligationId,offerId,benchmarkDisplayId:benchmark.id});
 assert.equal(result.valuation.quantity.amount,0.8);
 assert.equal(result.valuation.comparableValue.minor,60000n);
});

test('SW1-RC1 fulfilled economics comparison context cannot be caller-colluded',()=>{
 const {service,benchmark}=setup();
 const base={id:'member-econ:rc1-fraction',obligationId,participantId:member,specificationId:spec,quantity:quantity(4.5,'kg'),place:benchmark.place,serviceLevel:'pickup',goodsOutlay:money(50000n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('evidence:rc1-fraction-payment')],realizedAt:'2026-09-10T08:51:00Z',substitutionEvidenceIds:[]};
 assert.throws(()=>service.recordFulfilledEconomics({...base,id:'member-econ:rc1-bad-place',place:'Caller Fabricated Market'}),/MEMBER_ECONOMICS_COMPARISON_CONTEXT_NOT_CANONICAL/);
 assert.throws(()=>service.recordFulfilledEconomics({...base,id:'member-econ:rc1-bad-service',serviceLevel:'delivery'}),/MEMBER_ECONOMICS_COMPARISON_CONTEXT_NOT_CANONICAL/);
 assert.doesNotThrow(()=>service.recordFulfilledEconomics(base));
});

test('SW1-RC1 governed fulfilled economics fails closed without canonical catalog context',()=>{
 const {demand,resolution,economics,benchmark}=setup();
 const service=new GovernedMemberEconomicsService(demand,resolution,economics);
 assert.throws(()=>service.recordFulfilledEconomics({id:'member-econ:no-catalog',obligationId,participantId:member,specificationId:spec,quantity:quantity(4.5,'kg'),place:benchmark.place,serviceLevel:'pickup',goodsOutlay:money(50000n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('evidence:rc1-fraction-payment')],realizedAt:'2026-09-10T08:51:00Z',substitutionEvidenceIds:[]}),/MEMBER_ECONOMICS_CATALOG_REQUIRED/);
});

test('SW1-RC1 benchmark evidence observed after commitment cannot be back-projected into savings',()=>{
 const {service,benchmark}=setup({observedAt:'2026-09-10T08:18:00Z'});
 assert.throws(()=>service.recordGovernedSavingsBenchmark({benchmarkId:'benchmark:future',benchmarkVersion:1,valuationId:'valuation:future',obligationId,offerId,benchmarkDisplayId:benchmark.id}),/GOVERNED_BENCHMARK_EVIDENCE_FUTURE/);
});

test('SW1-RC1 governed benchmark package rolls back method when valuation fails and permits corrected retry',()=>{
 const {economics,service,benchmark}=setup();
 economics.defineBenchmark({id:'benchmark:seed',version:1,purpose:'MEMBER_SAVINGS',specificationId:spec,quantity:quantity(4.5,'kg'),place:benchmark.place,serviceLevel:'pickup',transactionLevel:'RETAIL',validFrom:offerValidity.validFrom,validUntil:offerValidity.validUntil,normalizationRuleVersion:'seed-v1',availabilityRuleVersion:'seed-v1',observationEvidenceIds:[benchmark.priceEvidenceId],definedAt:acceptedAt});
 economics.recordBenchmarkValuation({id:'valuation:collision',benchmarkId:'benchmark:seed',benchmarkVersion:1,obligationId,specificationId:spec,quantity:quantity(4.5,'kg'),place:benchmark.place,serviceLevel:'pickup',availability:'EXECUTABLE',comparableValue:money(54000n,'GHS'),evaluatedAt:acceptedAt,evidenceIds:[benchmark.priceEvidenceId]});
 assert.throws(()=>service.recordGovernedSavingsBenchmark({benchmarkId:'benchmark:atomic',benchmarkVersion:1,valuationId:'valuation:collision',obligationId,offerId,benchmarkDisplayId:benchmark.id}),/BENCHMARK_VALUATION_ID_DUPLICATE/);
 assert.equal(economics.getBenchmark('benchmark:atomic',1),undefined,'failed package must not strand benchmark method');
 const corrected=service.recordGovernedSavingsBenchmark({benchmarkId:'benchmark:atomic',benchmarkVersion:1,valuationId:'valuation:atomic-corrected',obligationId,offerId,benchmarkDisplayId:benchmark.id});
 assert.equal(corrected.method.id,'benchmark:atomic');
 assert.equal(corrected.valuation.id,'valuation:atomic-corrected');
});
