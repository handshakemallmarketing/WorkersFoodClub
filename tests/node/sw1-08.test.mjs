import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {InMemoryRemedyLedger} from '../../dist/packages/remedy/src/index.js';
import {CanonicalRecordLog,RebuildableProjection,snapshotDigest,assertFresh} from '../../dist/packages/projections/src/index.js';
import {GovernedMemberEconomicsService,memberOrderProjection} from '../../dist/packages/pilot-member-economics/src/index.js';

const pid=x=>asId(x),oid=x=>asId(x),sid=x=>asId(x),eid=x=>asId(x);
const member=pid('participant:member');
const club=pid('participant:club');
const obligationId=oid('obligation:sw1-08');
const spec=sid('spec:rice');
const commitment={obligation:{id:obligationId,obligor:member,beneficiary:club,specificationId:spec,quantity:quantity(5,'kg'),state:'OPEN'},participantId:member,acceptedAt:'2026-09-09T09:00:00Z',committedMemberPrice:money(800n,'GHS'),committedPriceBasis:quantity(5,'kg')};
const payment=(minor=800n)=>({evidenceId:eid('e:payment'),obligationId,provider:'SANDBOX_MOMO',providerReference:'ref:1',amount:money(minor,'GHS'),status:'CONFIRMED',observedAt:'2026-09-09T09:05:00Z',recordedAt:'2026-09-09T09:05:01Z'});
const demandFor=(price=800n)=>({getCommitment:id=>id===obligationId?{...commitment,committedMemberPrice:money(price,'GHS')}:undefined,paymentsFor:id=>id===obligationId?[payment(price)]:[]});

function economicsSetup(outlayMinor=800n){
 const economics=new InMemoryEconomicsLedger();
 const resolution=new InMemoryObligationResolutionLedger();
 resolution.recordPerformed('acceptance:1',{id:obligationId,quantity:quantity(5,'kg')},quantity(5,'kg'));
 const service=new GovernedMemberEconomicsService(demandFor(outlayMinor),resolution,economics);
 economics.defineBenchmark({id:'benchmark:rice',version:1,purpose:'MEMBER_SAVINGS',specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',transactionLevel:'RETAIL',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',normalizationRuleVersion:'norm:v1',availabilityRuleVersion:'availability:v1',observationEvidenceIds:[eid('e:market')],definedAt:'2026-09-01T00:00:00Z'});
 economics.recordBenchmarkValuation({id:'valuation:rice',benchmarkId:'benchmark:rice',benchmarkVersion:1,obligationId,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',availability:'EXECUTABLE',comparableValue:money(1000n,'GHS'),evaluatedAt:'2026-09-09T09:05:00Z',evidenceIds:[eid('e:market')]});
 service.recordFulfilledEconomics({id:'member-econ:1',obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(outlayMinor,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('e:payment')],realizedAt:'2026-09-09T09:10:00Z',substitutionEvidenceIds:[]});
 return {economics,resolution,service};
}

test('SW1-08 savings economics must be bound to actual performed quantity',()=>{
 const economics=new InMemoryEconomicsLedger();
 const resolution=new InMemoryObligationResolutionLedger();
 resolution.recordPerformed('acceptance:partial',{id:obligationId,quantity:quantity(5,'kg')},quantity(4,'kg'));
 const service=new GovernedMemberEconomicsService(demandFor(),resolution,economics);
 assert.throws(()=>service.recordFulfilledEconomics({id:'member-econ:forged',obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(800n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('e:payment')],realizedAt:'2026-09-09T09:10:00Z',substitutionEvidenceIds:[]}),/MEMBER_ECONOMICS_NOT_ACTUAL_PERFORMANCE/);
});

test('SW1-08 member economics rejects caller-fabricated outlay refund charges and evidence',()=>{
 const economics=new InMemoryEconomicsLedger();const resolution=new InMemoryObligationResolutionLedger();resolution.recordPerformed('acceptance:1',{id:obligationId,quantity:quantity(5,'kg')},quantity(5,'kg'));const service=new GovernedMemberEconomicsService(demandFor(),resolution,economics);
 const base={id:'member-econ:forged',obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(800n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('e:payment')],realizedAt:'2026-09-09T09:10:00Z',substitutionEvidenceIds:[]};
 assert.throws(()=>service.recordFulfilledEconomics({...base,goodsOutlay:money(1n,'GHS')}),/MEMBER_ECONOMICS_OUTLAY_NOT_CANONICAL/);
 assert.throws(()=>service.recordFulfilledEconomics({...base,mandatoryCharges:money(1n,'GHS')}),/MEMBER_ECONOMICS_CHARGES_NOT_CANONICAL/);
 assert.throws(()=>service.recordFulfilledEconomics({...base,refundApplied:money(800n,'GHS')}),/MEMBER_ECONOMICS_REFUND_NOT_CANONICAL/);
 assert.throws(()=>service.recordFulfilledEconomics({...base,economicEvidenceIds:[eid('e:made-up')]}),/MEMBER_ECONOMICS_EVIDENCE_NOT_CANONICAL/);
});

test('SW1-08 completed replacement contributes to actual fulfilled goods quantity',()=>{
 const economics=new InMemoryEconomicsLedger();const resolution=new InMemoryObligationResolutionLedger();resolution.recordPerformed('acceptance:4kg',{id:obligationId,quantity:quantity(5,'kg')},quantity(4,'kg'));const remedies=new InMemoryRemedyLedger(resolution);
 remedies.recordException({id:'exception:shortfall',obligationId,participantId:member,kind:'SHORTFALL',affectedQuantity:quantity(1,'kg'),occurredAt:'2026-09-09T09:06:00Z',evidenceIds:[eid('e:shortfall')]},{id:obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg')});
 remedies.createRemedy({id:'remedy:replacement',sourceExceptionId:'exception:shortfall',originalObligationId:obligationId,participantId:member,kind:'REPLACEMENT',quantity:quantity(1,'kg'),createdAt:'2026-09-09T09:07:00Z',authorizedEventId:'event:replacement',evidenceIds:[eid('e:replacement-auth')],economicClassification:'REMEDY_SETTLEMENT'});
 remedies.completeRemedy({id:'completion:replacement',remedyObligationId:'remedy:replacement',quantity:quantity(1,'kg'),completedAt:'2026-09-09T09:08:00Z',evidenceIds:[eid('e:replacement-complete')]});
 const service=new GovernedMemberEconomicsService(demandFor(),resolution,economics,remedies);
 assert.doesNotThrow(()=>service.recordFulfilledEconomics({id:'member-econ:replacement',obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(800n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('e:payment')],realizedAt:'2026-09-09T09:10:00Z',substitutionEvidenceIds:[eid('e:replacement-complete')]}));
});

test('SW1-08 canonical completed refund is required before refund can reduce member outlay',()=>{
 const economics=new InMemoryEconomicsLedger();const resolution=new InMemoryObligationResolutionLedger();resolution.recordPerformed('acceptance:4kg',{id:obligationId,quantity:quantity(5,'kg')},quantity(4,'kg'));const remedies=new InMemoryRemedyLedger(resolution);
 remedies.recordException({id:'exception:refund',obligationId,participantId:member,kind:'SHORTFALL',affectedQuantity:quantity(1,'kg'),occurredAt:'2026-09-09T09:06:00Z',evidenceIds:[eid('e:shortfall')]},{id:obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg')});
 remedies.createRemedy({id:'remedy:refund',sourceExceptionId:'exception:refund',originalObligationId:obligationId,participantId:member,kind:'REFUND',quantity:quantity(1,'kg'),createdAt:'2026-09-09T09:07:00Z',authorizedEventId:'event:refund',evidenceIds:[eid('e:refund-auth')],economicClassification:'REMEDY_SETTLEMENT'});
 remedies.completeRemedy({id:'completion:refund',remedyObligationId:'remedy:refund',quantity:quantity(1,'kg'),completedAt:'2026-09-09T09:08:00Z',evidenceIds:[eid('e:refund-settled')],settlementAmount:money(160n,'GHS')});
 const service=new GovernedMemberEconomicsService(demandFor(),resolution,economics,remedies);
 assert.doesNotThrow(()=>service.recordFulfilledEconomics({id:'member-econ:refund',obligationId,participantId:member,specificationId:spec,quantity:quantity(4,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(800n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(160n,'GHS'),economicEvidenceIds:[eid('e:payment'),eid('e:refund-settled')],realizedAt:'2026-09-09T09:10:00Z',substitutionEvidenceIds:[]}));
});

test('SW1-08 signed savings preserves positive, zero and negative outcomes',()=>{
 const positive=economicsSetup(800n).service.calculateSavings({id:'savings:positive',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});assert.equal(positive.absoluteSavings.minor,200n);
 const zero=economicsSetup(1000n).service.calculateSavings({id:'savings:zero',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});assert.equal(zero.absoluteSavings.minor,0n);
 const negative=economicsSetup(1200n).service.calculateSavings({id:'savings:negative',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});assert.equal(negative.absoluteSavings.minor,-200n);
});

test('SW1-08 savings corrections require explicit lineage',()=>{const {economics,service}=economicsSetup(800n);service.calculateSavings({id:'savings:v1',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});assert.throws(()=>service.calculateSavings({id:'savings:v2',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:21:00Z'}),/SAVINGS_CORRECTION_LINEAGE_INVALID/);assert.ok(economics.getSavings('savings:v1'));});

test('SW1-08 order history projection is rebuildable, lineage-backed and freshness-aware',()=>{
 const log=new CanonicalRecordLog();log.append({stream:'orders',sequence:1,recordId:'order:1',occurredAt:'2026-09-09T09:00:00Z',payload:{kind:'ORDER_COMMITTED',obligationId:String(obligationId),participantId:String(member),specificationId:String(spec),quantity:5,unit:'kg'}});log.append({stream:'orders',sequence:2,recordId:'resolution:1',occurredAt:'2026-09-09T09:15:00Z',payload:{kind:'ORDER_RESOLUTION',obligationId:String(obligationId),performedQuantity:4,remediedQuantity:1,unresolvedQuantity:0,unit:'kg'}});log.append({stream:'orders',sequence:3,recordId:'savings:1',occurredAt:'2026-09-09T09:20:00Z',payload:{kind:'ORDER_SAVINGS',obligationId:String(obligationId),entryId:'savings:positive',minor:200n,currency:'GHS'}});
 const projection=new RebuildableProjection(memberOrderProjection);const first=projection.rebuild(log.all(),'2026-09-09T09:21:00Z');assertFresh(first,log.all());const digest=snapshotDigest(first);const row=first.rows.get(String(obligationId));assert.equal(row?.performedQuantity,4);assert.equal(row?.remediedQuantity,1);assert.equal(row?.latestSavingsMinor,200n);assert.equal(row?.sourceRecordIds.length,3);assert.throws(()=>row?.sourceRecordIds.push('tamper'),/TypeError/);
 projection.drop();const rebuilt=projection.rebuild(log.all(),'2026-09-09T09:22:00Z');assert.equal(snapshotDigest(rebuilt),digest);log.append({stream:'orders',sequence:4,recordId:'savings:2',occurredAt:'2026-09-09T09:23:00Z',payload:{kind:'ORDER_SAVINGS',obligationId:String(obligationId),entryId:'savings:corrected',minor:150n,currency:'GHS',supersedes:'savings:positive'}});assert.throws(()=>assertFresh(rebuilt,log.all()),/PROJECTION_STALE/);
});

test('SW1-08 order projection rejects savings replacement without exact lineage',()=>{
 const base=[{stream:'orders',sequence:1,recordId:'order:1',occurredAt:'2026-09-09T09:00:00Z',payload:{kind:'ORDER_COMMITTED',obligationId:String(obligationId),participantId:String(member),specificationId:String(spec),quantity:5,unit:'kg'}},{stream:'orders',sequence:2,recordId:'savings:1',occurredAt:'2026-09-09T09:20:00Z',payload:{kind:'ORDER_SAVINGS',obligationId:String(obligationId),entryId:'savings:v1',minor:200n,currency:'GHS'}}];
 assert.throws(()=>new RebuildableProjection(memberOrderProjection).rebuild([...base,{stream:'orders',sequence:3,recordId:'savings:2',occurredAt:'2026-09-09T09:21:00Z',payload:{kind:'ORDER_SAVINGS',obligationId:String(obligationId),entryId:'savings:v2',minor:150n,currency:'GHS'}}],'2026-09-09T09:22:00Z'),/ORDER_PROJECTION_SAVINGS_LINEAGE_INVALID/);
 assert.throws(()=>new RebuildableProjection(memberOrderProjection).rebuild([{...base[0]},{stream:'orders',sequence:2,recordId:'savings:first',occurredAt:'2026-09-09T09:20:00Z',payload:{kind:'ORDER_SAVINGS',obligationId:String(obligationId),entryId:'savings:first',minor:200n,currency:'GHS',supersedes:'missing'}}],'2026-09-09T09:22:00Z'),/ORDER_PROJECTION_SAVINGS_LINEAGE_INVALID/);
});
