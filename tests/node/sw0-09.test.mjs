import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,money,quantity} from '../../dist/packages/kernel/src/index.js';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';

const sid=x=>asId(x), oid=x=>asId(x), pid=x=>asId(x), eid=x=>asId(x);
const obligationId=oid('obligation:rice-1'), participantId=pid('participant:member'), spec=sid('spec:rice-5kg');
const benchmark=(overrides={})=>({id:'benchmark:retail-rice',version:1,purpose:'MEMBER_SAVINGS',specificationId:spec,quantity:quantity(5,'kg'),place:'hospital:korle-bu',serviceLevel:'PICKUP',transactionLevel:'RETAIL',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',normalizationRuleVersion:'norm:v1',availabilityRuleVersion:'availability:v1',observationEvidenceIds:[eid('evidence:market-1'),eid('evidence:market-2')],definedAt:'2026-09-01T00:00:00Z',...overrides});
const valuation=(overrides={})=>({id:'valuation:rice-1',benchmarkId:'benchmark:retail-rice',benchmarkVersion:1,obligationId,specificationId:spec,quantity:quantity(5,'kg'),place:'hospital:korle-bu',serviceLevel:'PICKUP',availability:'EXECUTABLE',comparableValue:money(50000n,'GHS'),evaluatedAt:'2026-09-07T10:00:00Z',evidenceIds:[eid('evidence:market-2')],...overrides});
const memberEconomics=(overrides={})=>({id:'member-econ:rice-1',obligationId,participantId,specificationId:spec,quantity:quantity(5,'kg'),place:'hospital:korle-bu',serviceLevel:'PICKUP',goodsOutlay:money(45000n,'GHS'),mandatoryCharges:money(1000n,'GHS'),refundApplied:money(0n,'GHS'),economicEvidenceIds:[eid('evidence:payment'),eid('evidence:pickup')],realizedAt:'2026-09-07T10:05:00Z',substitutionEvidenceIds:[],...overrides});
const prepared=()=>{const l=new InMemoryEconomicsLedger();l.defineBenchmark(benchmark());l.recordBenchmarkValuation(valuation());l.recordFulfilledMemberEconomics(memberEconomics());return l;};

test('INV-013 savings requires governed comparable executable benchmark',()=>{
 const l=new InMemoryEconomicsLedger(); l.defineBenchmark(benchmark());
 assert.throws(()=>l.recordBenchmarkValuation(valuation({availability:'UNAVAILABLE'})),/BENCHMARK_NOT_EXECUTABLE/);
 assert.throws(()=>l.recordBenchmarkValuation(valuation({place:'market:wrong'})),/BENCHMARK_COMPARABILITY_MISMATCH/);
});

test('INV-013 actual mandatory member charges are included in comparable outlay',()=>{
 const l=prepared(); const s=l.calculateSavings({id:'savings:1',benchmarkValuationId:'valuation:rice-1',memberEconomicsId:'member-econ:rice-1',calculatedAt:'2026-09-07T10:06:00Z'});
 assert.equal(s.comparableMemberOutlay.minor,46000n); assert.equal(s.absoluteSavings.minor,4000n); assert.equal(s.benchmarkRelativeBasisPoints,800n);
});

test('FX-014 negative savings remain in the ledger and cannot be hidden',()=>{
 const zero=prepared(); zero.recordFulfilledMemberEconomics(memberEconomics({id:'member-econ:zero',goodsOutlay:money(49000n,'GHS')}));
 assert.equal(zero.calculateSavings({id:'savings:zero',benchmarkValuationId:'valuation:rice-1',memberEconomicsId:'member-econ:zero',calculatedAt:'2026-09-07T10:06:00Z'}).absoluteSavings.minor,0n);
 const negative=prepared(); negative.recordFulfilledMemberEconomics(memberEconomics({id:'member-econ:negative',goodsOutlay:money(51000n,'GHS')}));
 const s=negative.calculateSavings({id:'savings:negative',benchmarkValuationId:'valuation:rice-1',memberEconomicsId:'member-econ:negative',calculatedAt:'2026-09-07T10:06:00Z'});
 assert.equal(s.absoluteSavings.minor,-2000n); assert.equal(s.benchmarkRelativeBasisPoints,-400n); assert.equal(negative.getSavings('savings:negative').absoluteSavings.minor,-2000n);
});

test('C2 benchmark method must exist before valuation and savings cannot compare incompatible quantity',()=>{
 const l=new InMemoryEconomicsLedger(); assert.throws(()=>l.recordBenchmarkValuation(valuation()),/BENCHMARK_METHOD_UNKNOWN/); l.defineBenchmark(benchmark()); l.recordBenchmarkValuation(valuation());
 l.recordFulfilledMemberEconomics(memberEconomics({quantity:quantity(4,'kg')}));
 assert.throws(()=>l.calculateSavings({id:'savings:bad',benchmarkValuationId:'valuation:rice-1',memberEconomicsId:'member-econ:rice-1',calculatedAt:'2026-09-07T10:06:00Z'}),/SAVINGS_COMPARABILITY_MISMATCH/);
});

test('FX-013 benchmark cannot cherry-pick evidence outside the governed observation set',()=>{
 const l=new InMemoryEconomicsLedger(); l.defineBenchmark(benchmark({observationEvidenceIds:[eid('evidence:market-normal')]}));
 assert.throws(()=>l.recordBenchmarkValuation(valuation({evidenceIds:[eid('evidence:market-high-outlier')]})),/BENCHMARK_EVIDENCE_OUTSIDE_GOVERNED_SET/);
});

test('C2 stale benchmark cannot manufacture member savings',()=>{
 const l=new InMemoryEconomicsLedger(); l.defineBenchmark(benchmark({validUntil:'2026-09-06T23:59:59Z'}));
 assert.throws(()=>l.recordBenchmarkValuation(valuation()),/BENCHMARK_VALUATION_INVALID/);
});

test('C6 refund changes actual member economics and forces recomputed savings as a new entry',()=>{
 const l=prepared(); const first=l.calculateSavings({id:'savings:before-refund',benchmarkValuationId:'valuation:rice-1',memberEconomicsId:'member-econ:rice-1',calculatedAt:'2026-09-07T10:06:00Z'});
 l.recordFulfilledMemberEconomics(memberEconomics({id:'member-econ:after-refund',refundApplied:money(5000n,'GHS'),realizedAt:'2026-09-07T10:10:00Z'}));
 const corrected=l.calculateSavings({id:'savings:after-refund',benchmarkValuationId:'valuation:rice-1',memberEconomicsId:'member-econ:after-refund',calculatedAt:'2026-09-07T10:11:00Z',supersedes:first.id});
 assert.equal(first.absoluteSavings.minor,4000n); assert.equal(corrected.absoluteSavings.minor,9000n); assert.equal(l.getSavings(first.id).absoluteSavings.minor,4000n);
});

test('INV-012 cost basis is purpose-specific and fully componentized',()=>{
 const l=prepared(); const c=l.recordCostBasis({id:'cost:fulfilled-rice',obligationId,purpose:'FULFILLED_MEMBER_OBLIGATION',currency:'GHS',methodVersion:'cost:v1',components:[
  {kind:'ACQUISITION',amount:money(30000n,'GHS'),evidenceIds:[eid('evidence:purchase')]},{kind:'INBOUND_LOGISTICS',amount:money(3000n,'GHS'),evidenceIds:[eid('evidence:truck')]},{kind:'HANDLING',amount:money(2000n,'GHS'),evidenceIds:[eid('evidence:handling')]},{kind:'FINANCING',amount:money(1000n,'GHS'),evidenceIds:[eid('evidence:finance')]},{kind:'OUTBOUND_LOGISTICS',amount:money(2000n,'GHS'),evidenceIds:[eid('evidence:outbound')]},{kind:'RISK',amount:money(1000n,'GHS'),evidenceIds:[eid('evidence:risk')]}
 ],support:[],calculatedAt:'2026-09-07T10:05:00Z'});
 assert.equal(c.purpose,'FULFILLED_MEMBER_OBLIGATION'); assert.equal(c.riskAdjustedCost.minor,39000n); assert.equal(c.components.length,6);
});

test('INV-014 subsidy and promotion remain separate from structural advantage',()=>{
 const l=prepared(); const c=l.recordCostBasis({id:'cost:supported-rice',obligationId,purpose:'FULFILLED_MEMBER_OBLIGATION',currency:'GHS',methodVersion:'cost:v1',components:[{kind:'ACQUISITION',amount:money(35000n,'GHS'),evidenceIds:[eid('evidence:purchase')]},{kind:'OUTBOUND_LOGISTICS',amount:money(5000n,'GHS'),evidenceIds:[eid('evidence:delivery')]}],support:[{kind:'SUBSIDY',amount:money(7000n,'GHS'),evidenceIds:[eid('evidence:grant')]},{kind:'PROMOTION',amount:money(3000n,'GHS'),evidenceIds:[eid('evidence:promo')]}],calculatedAt:'2026-09-07T10:05:00Z'});
 const a=l.assessStructuralAdvantage({id:'advantage:1',costBasisId:c.id,alternativeBenchmarkValuationId:'valuation:rice-1',calculatedAt:'2026-09-07T10:06:00Z'});
 assert.equal(a.riskAdjustedSystemCost.minor,40000n); assert.equal(a.nonStructuralSupport.minor,10000n); assert.equal(a.structuralAdvantage.minor,10000n);
});

test('FX-015 supplier promotion cannot be labeled structural advantage',()=>{
 const l=prepared(); const c=l.recordCostBasis({id:'cost:promo-heavy',obligationId,purpose:'FULFILLED_MEMBER_OBLIGATION',currency:'GHS',methodVersion:'cost:v1',components:[{kind:'ACQUISITION',amount:money(48000n,'GHS'),evidenceIds:[eid('evidence:purchase')]}],support:[{kind:'PROMOTION',amount:money(20000n,'GHS'),evidenceIds:[eid('evidence:promo')]}],calculatedAt:'2026-09-07T10:05:00Z'});
 const a=l.assessStructuralAdvantage({id:'advantage:promo',costBasisId:c.id,alternativeBenchmarkValuationId:'valuation:rice-1',calculatedAt:'2026-09-07T10:06:00Z'});
 assert.equal(a.structuralAdvantage.minor,2000n); assert.equal(a.nonStructuralSupport.minor,20000n);
});
