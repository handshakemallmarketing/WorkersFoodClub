import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {CanonicalRecordLog,RebuildableProjection,snapshotDigest,assertFresh} from '../../dist/packages/projections/src/index.js';
import {GovernedMemberEconomicsService,memberOrderProjection} from '../../dist/packages/pilot-member-economics/src/index.js';

const pid=x=>asId(x),oid=x=>asId(x),sid=x=>asId(x),eid=x=>asId(x);
const member=pid('participant:member');
const club=pid('participant:club');
const obligationId=oid('obligation:sw1-08');
const spec=sid('spec:rice');
const commitment={obligation:{id:obligationId,obligor:member,beneficiary:club,specificationId:spec,quantity:quantity(5,'kg'),state:'OPEN'},participantId:member,acceptedAt:'2026-09-09T09:00:00Z'};

function economicsSetup(outlayMinor=800n){
 const economics=new InMemoryEconomicsLedger();
 const resolution=new InMemoryObligationResolutionLedger();
 resolution.recordPerformed('acceptance:1',{id:obligationId,quantity:quantity(5,'kg')},quantity(5,'kg'));
 const demand={getCommitment:id=>id===obligationId?commitment:undefined};
 const service=new GovernedMemberEconomicsService(demand,resolution,economics);
 economics.defineBenchmark({id:'benchmark:rice',version:1,purpose:'MEMBER_SAVINGS',specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',transactionLevel:'RETAIL',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',normalizationRuleVersion:'norm:v1',availabilityRuleVersion:'availability:v1',observationEvidenceIds:[eid('e:market')],definedAt:'2026-09-01T00:00:00Z'});
 economics.recordBenchmarkValuation({id:'valuation:rice',benchmarkId:'benchmark:rice',benchmarkVersion:1,obligationId,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',availability:'EXECUTABLE',comparableValue:money(1000n,'GHS'),evaluatedAt:'2026-09-09T09:05:00Z',evidenceIds:[eid('e:market')]});
 service.recordFulfilledEconomics({id:'member-econ:1',obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(outlayMinor,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('e:receipt')],realizedAt:'2026-09-09T09:10:00Z',substitutionEvidenceIds:[]});
 return {economics,resolution,service};
}

test('SW1-08 savings economics must be bound to actual performed quantity',()=>{
 const economics=new InMemoryEconomicsLedger();
 const resolution=new InMemoryObligationResolutionLedger();
 resolution.recordPerformed('acceptance:partial',{id:obligationId,quantity:quantity(5,'kg')},quantity(4,'kg'));
 const service=new GovernedMemberEconomicsService({getCommitment:id=>id===obligationId?commitment:undefined},resolution,economics);
 assert.throws(()=>service.recordFulfilledEconomics({id:'member-econ:forged',obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(800n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('e:receipt')],realizedAt:'2026-09-09T09:10:00Z',substitutionEvidenceIds:[]}),/MEMBER_ECONOMICS_NOT_ACTUAL_PERFORMANCE/);
});

test('SW1-08 signed savings preserves positive, zero and negative outcomes',()=>{
 const positive=economicsSetup(800n).service.calculateSavings({id:'savings:positive',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});
 assert.equal(positive.absoluteSavings.minor,200n);
 const zero=economicsSetup(1000n).service.calculateSavings({id:'savings:zero',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});
 assert.equal(zero.absoluteSavings.minor,0n);
 const negative=economicsSetup(1200n).service.calculateSavings({id:'savings:negative',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});
 assert.equal(negative.absoluteSavings.minor,-200n);
});

test('SW1-08 savings corrections require explicit lineage',()=>{
 const {economics,service}=economicsSetup(800n);
 service.calculateSavings({id:'savings:v1',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:20:00Z'});
 assert.throws(()=>service.calculateSavings({id:'savings:v2',benchmarkValuationId:'valuation:rice',memberEconomicsId:'member-econ:1',calculatedAt:'2026-09-09T09:21:00Z'}),/SAVINGS_CORRECTION_LINEAGE_INVALID/);
 assert.ok(economics.getSavings('savings:v1'));
});

test('SW1-08 order history projection is rebuildable, lineage-backed and freshness-aware',()=>{
 const log=new CanonicalRecordLog();
 log.append({stream:'orders',sequence:1,recordId:'order:1',occurredAt:'2026-09-09T09:00:00Z',payload:{kind:'ORDER_COMMITTED',obligationId:String(obligationId),participantId:String(member),specificationId:String(spec),quantity:5,unit:'kg'}});
 log.append({stream:'orders',sequence:2,recordId:'resolution:1',occurredAt:'2026-09-09T09:15:00Z',payload:{kind:'ORDER_RESOLUTION',obligationId:String(obligationId),performedQuantity:4,remediedQuantity:1,unresolvedQuantity:0,unit:'kg'}});
 log.append({stream:'orders',sequence:3,recordId:'savings:1',occurredAt:'2026-09-09T09:20:00Z',payload:{kind:'ORDER_SAVINGS',obligationId:String(obligationId),entryId:'savings:positive',minor:200n,currency:'GHS'}});
 const projection=new RebuildableProjection(memberOrderProjection);
 const first=projection.rebuild(log.all(),'2026-09-09T09:21:00Z');
 assertFresh(first,log.all());
 const digest=snapshotDigest(first);
 const row=first.rows.get(String(obligationId));
 assert.equal(row?.performedQuantity,4);assert.equal(row?.remediedQuantity,1);assert.equal(row?.latestSavingsMinor,200n);assert.equal(row?.sourceRecordIds.length,3);
 projection.drop();
 const rebuilt=projection.rebuild(log.all(),'2026-09-09T09:22:00Z');
 assert.equal(snapshotDigest(rebuilt),digest);
 log.append({stream:'orders',sequence:4,recordId:'savings:2',occurredAt:'2026-09-09T09:23:00Z',payload:{kind:'ORDER_SAVINGS',obligationId:String(obligationId),entryId:'savings:corrected',minor:150n,currency:'GHS',supersedes:'savings:positive'}});
 assert.throws(()=>assertFresh(rebuilt,log.all()),/PROJECTION_STALE/);
});
