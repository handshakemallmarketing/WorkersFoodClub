import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';
import {CanonicalRecordLog,RebuildableProjection,assertFresh} from '../../dist/packages/projections/src/index.js';
import {memberOrderProjection} from '../../dist/packages/pilot-member-economics/src/index.js';

const id=x=>asId(x);
const spec=id('spec:rc1-runtime');
const obligation=id('obligation:rc1-runtime');
const evidence=id('evidence:rc1-runtime');

const benchmarkMethod=(benchmarkId,version=1)=>({id:benchmarkId,version,purpose:'MEMBER_SAVINGS',specificationId:spec,quantity:quantity(1,'kg'),place:'Accra',serviceLevel:'pickup',transactionLevel:'RETAIL',validFrom:'2026-09-10T08:00:00Z',validUntil:'2026-09-10T18:00:00Z',normalizationRuleVersion:'norm:v1',availabilityRuleVersion:'availability:v1',observationEvidenceIds:[evidence],definedAt:'2026-09-10T08:00:00Z'});
const valuation=(benchmarkId,benchmarkVersion=1,valuationId='valuation:rc1-runtime')=>({id:valuationId,benchmarkId,benchmarkVersion,obligationId:obligation,specificationId:spec,quantity:quantity(1,'kg'),place:'Accra',serviceLevel:'pickup',availability:'EXECUTABLE',comparableValue:money(1000n,'GHS'),evaluatedAt:'2026-09-10T09:00:00Z',evidenceIds:[evidence]});

test('SW1-RC1 atomic benchmark package rejects a valuation bound to another method before mutation',()=>{
 const economics=new InMemoryEconomicsLedger();
 economics.defineBenchmark(benchmarkMethod('benchmark:A'));
 assert.throws(()=>economics.recordBenchmarkPackage(benchmarkMethod('benchmark:B'),valuation('benchmark:A',1,'valuation:mismatched-package')),/BENCHMARK_PACKAGE_IDENTITY_MISMATCH/);
 assert.equal(economics.getBenchmark('benchmark:B',1),undefined,'mismatched package must not persist the new method');
 assert.equal(economics.getBenchmarkValuation('valuation:mismatched-package'),undefined,'mismatched package must not persist a valuation');
});

test('SW1-RC1 projection snapshots expose no runtime mutation path through rows',()=>{
 const log=new CanonicalRecordLog();
 log.append({stream:'orders',sequence:1,recordId:'order:runtime:committed',occurredAt:'2026-09-10T08:00:00Z',payload:{kind:'ORDER_COMMITTED',obligationId:String(obligation),participantId:'participant:member',specificationId:String(spec),quantity:1,unit:'kg'}});
 const projection=new RebuildableProjection(memberOrderProjection);
 const snapshot=projection.rebuild(log.all(),'2026-09-10T08:01:00Z');
 const canonicalRow=snapshot.rows.get(String(obligation));
 assert.ok(canonicalRow);
 assert.equal(snapshot.rows.set,undefined,'snapshot rows must not expose Map#set');
 assert.throws(()=>Map.prototype.set.call(snapshot.rows,String(obligation),{...canonicalRow,participantId:'participant:forged'}),TypeError);
 assertFresh(snapshot,log.all());
 assert.equal(snapshot.rows.get(String(obligation)).participantId,'participant:member');
});
