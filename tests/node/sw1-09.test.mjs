import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {GovernedPilotOperationsService} from '../../dist/packages/pilot-operations/src/index.js';

const pid=x=>asId(x),gid=x=>asId(x);
const actor=pid('participant:admin-1');
const otherActor=pid('participant:admin-2');
const target='obligation:sw1-09';
const at='2026-09-10T10:00:00Z';
function setup(auditSources=[]){
 const store=new InMemoryAuthorityStore();
 const adminGrant=gid('grant:admin');
 const recoveryGrant=gid('grant:recovery');
 const auditGrant=gid('grant:audit');
 store.put({id:adminGrant,grantorId:pid('participant:club'),actorId:actor,actions:['admin.obligation.annotate'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 store.put({id:recoveryGrant,grantorId:pid('participant:club'),actorId:actor,actions:['admin.recovery.reconcile'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 store.put({id:auditGrant,grantorId:pid('participant:club'),actorId:actor,actions:['admin.audit.read'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 return {service:new GovernedPilotOperationsService(new AuthorityEvaluator(store),auditSources),adminGrant,recoveryGrant,auditGrant};
}
const effect=(result,id)=>({result,sourceRecordIds:[id]});

test('SW1-09 rejects unauthorized admin mutation and records the rejected attempt',()=>{
 const {service}=setup();
 assert.throws(()=>service.executeMutation({actorId:actor,grantIds:[],at},{requestId:'req:unauthorized',action:'admin.obligation.annotate',targetId:target,reason:'operator note',payload:{note:'x'}},()=>effect({ok:true},'canonical:unauthorized')),/ADMIN_UNAUTHORIZED/);
 const log=service.auditLog();
 assert.equal(log.length,1); assert.equal(log[0].outcome,'REJECTED'); assert.equal(log[0].authorityReason,'NO_GRANT');
});

test('SW1-09 accepted admin request is idempotent, actor-bound, and conflicting reuse fails closed',()=>{
 const {service,adminGrant}=setup(); let effects=0;
 const ctx={actorId:actor,grantIds:[adminGrant],at};
 const request={requestId:'req:1',action:'admin.obligation.annotate',targetId:target,reason:'investigate mismatch',payload:{note:'checked'}};
 const first=service.executeMutation(ctx,request,()=>effect({effect:++effects},'canonical:note:1'));
 const replay=service.executeMutation(ctx,request,()=>effect({effect:++effects},'canonical:note:2'));
 assert.deepEqual(replay,first); assert.equal(effects,1);
 assert.throws(()=>service.executeMutation(ctx,{...request,payload:{note:'tampered'}},()=>effect({effect:++effects},'canonical:tampered')),/ADMIN_REQUEST_ID_CONFLICT/);
 assert.throws(()=>service.executeMutation({actorId:otherActor,grantIds:[],at},request,()=>effect({effect:++effects},'canonical:stolen')),/ADMIN_REQUEST_ID_CONFLICT/);
 assert.equal(effects,1);
 assert.equal(service.auditLog().at(-1).authorityReason,'REQUEST_ID_CONFLICT');
});

test('SW1-09 failed mutation cannot be blindly retried under the same request id',()=>{
 const {service,adminGrant}=setup(); let attempts=0;
 const ctx={actorId:actor,grantIds:[adminGrant],at};
 const request={requestId:'req:failed',action:'admin.obligation.annotate',targetId:target,reason:'repair',payload:{}};
 assert.throws(()=>service.executeMutation(ctx,request,()=>{attempts++;throw new Error('DEPENDENCY_DOWN');}),/DEPENDENCY_DOWN/);
 assert.throws(()=>service.executeMutation(ctx,request,()=>effect({ok:true},'canonical:forbidden-retry')),/ADMIN_REQUEST_REJECTED/);
 assert.equal(attempts,1);
});

test('SW1-09 recovery retries only the same previously authorized failed operation after no-effect reconciliation',()=>{
 const {service,adminGrant,recoveryGrant}=setup(); let attempts=0;
 const original={requestId:'req:original-failed',action:'admin.obligation.annotate',targetId:target,reason:'canonical op',payload:{note:'same-payload'}};
 assert.throws(()=>service.executeMutation({actorId:actor,grantIds:[adminGrant],at},original,()=>{
  attempts++;
  if(attempts===1) throw new Error('PROVIDER_TIMEOUT');
  return effect({ok:true},'canonical:retry-result');
 }),/PROVIDER_TIMEOUT/);
 const recoveryCtx={actorId:actor,grantIds:[recoveryGrant],at:'2026-09-10T10:05:00Z'};
 const input={recoveryRequestId:'req:recover',originalRequestId:'req:original-failed',reason:'provider confirms no effect',maxAgeMs:10*60*1000};
 const first=service.recover(recoveryCtx,input,()=>({effectObserved:false,sourceRecordIds:['provider:probe:no-effect']}));
 const replay=service.recover(recoveryCtx,input,()=>({effectObserved:false,sourceRecordIds:['provider:should-not-run']}));
 assert.equal(first.disposition,'RETRIED'); assert.deepEqual(replay,first); assert.equal(attempts,2);
});

test('SW1-09 recovery does not retry when reconciliation proves the original effect already occurred',()=>{
 const {service,adminGrant,recoveryGrant}=setup(); let attempts=0;
 assert.throws(()=>service.executeMutation({actorId:actor,grantIds:[adminGrant],at},{requestId:'req:unknown-outcome',action:'admin.obligation.annotate',targetId:target,reason:'unknown outcome',payload:{}},()=>{attempts++;throw new Error('TIMEOUT_AFTER_PROVIDER_SUCCESS');}),/TIMEOUT_AFTER_PROVIDER_SUCCESS/);
 const result=service.recover({actorId:actor,grantIds:[recoveryGrant],at:'2026-09-10T10:01:00Z'},{recoveryRequestId:'req:reconcile-existing',originalRequestId:'req:unknown-outcome',reason:'provider lookup',maxAgeMs:60_000},()=>({effectObserved:true,sourceRecordIds:['provider:confirmed-effect']}));
 assert.equal(result.disposition,'ALREADY_APPLIED'); assert.equal(attempts,1);
});

test('SW1-09 stale recovery fails closed and is audited as rejected',()=>{
 const {service,adminGrant,recoveryGrant}=setup();
 assert.throws(()=>service.executeMutation({actorId:actor,grantIds:[adminGrant],at},{requestId:'req:stale-original',action:'admin.obligation.annotate',targetId:target,reason:'stale op',payload:{}},()=>{throw new Error('TIMEOUT');}),/TIMEOUT/);
 assert.throws(()=>service.recover({actorId:actor,grantIds:[recoveryGrant],at:'2026-09-10T12:00:00Z'},{recoveryRequestId:'req:stale-recovery',originalRequestId:'req:stale-original',reason:'too late',maxAgeMs:10*60*1000},()=>({effectObserved:false,sourceRecordIds:['probe:late']})),/RECOVERY_STALE/);
 assert.equal(service.auditLog().at(-1).outcome,'REJECTED');
 assert.equal(service.auditLog().at(-1).authorityReason,'MUTATION_FAILED');
});

test('SW1-09 stuck-work diagnosis is separately read-authorized and identifies retryable uncertain work',()=>{
 const {service,adminGrant,auditGrant}=setup();
 assert.throws(()=>service.executeMutation({actorId:actor,grantIds:[adminGrant],at},{requestId:'req:stuck',action:'admin.obligation.annotate',targetId:target,reason:'provider operation',payload:{}},()=>{throw new Error('TIMEOUT');}),/TIMEOUT/);
 assert.throws(()=>service.diagnose({actorId:actor,grantIds:[],at:'2026-09-10T10:02:00Z'},'req:stuck',60_000),/AUDIT_VIEW_UNAUTHORIZED/);
 const diagnosis=service.diagnose({actorId:actor,grantIds:[auditGrant],at:'2026-09-10T10:02:00Z'},'req:stuck',60_000);
 assert.equal(diagnosis.retryable,true); assert.equal(diagnosis.stale,true); assert.equal(diagnosis.authoritative,false); assert.equal(diagnosis.failureReason,'MUTATION_FAILED');
});

test('SW1-09 audit view exposes current state and canonical lineage across all prescribed pilot domains',()=>{
 const domains=['MEMBER','OBLIGATION','PAYMENT','INVENTORY','FULFILLMENT','REMEDY','ECONOMICS'];
 const auditSources=domains.map((domain,index)=>({
  domain,
  read:targetId=>({domain,targetId,currentState:{status:`${domain}:CURRENT`},sourceRecordIds:[`canonical:${domain.toLowerCase()}:1`],observedAt:`2026-09-10T10:00:0${index}Z`})
 }));
 const {service,adminGrant,auditGrant}=setup(auditSources);
 service.executeMutation({actorId:actor,grantIds:[adminGrant],at},{requestId:'req:view',action:'admin.obligation.annotate',targetId:target,reason:'audit source',payload:{}},()=>effect({ok:true},'canonical:admin-mutation'));
 assert.throws(()=>service.auditView({actorId:actor,grantIds:[],at:'2026-09-10T10:00:30Z'},target,60_000),/AUDIT_VIEW_UNAUTHORIZED/);
 const fresh=service.auditView({actorId:actor,grantIds:[auditGrant],at:'2026-09-10T10:00:30Z'},target,60_000);
 assert.equal(fresh.authoritative,false); assert.equal(fresh.stale,false); assert.equal(fresh.domainSnapshots.length,7); assert.deepEqual(fresh.domainSnapshots.map(x=>x.domain),domains);
 assert.equal(fresh.operationalRecords.length,1); assert.deepEqual(fresh.operationalRecords[0].sourceRecordIds,['canonical:admin-mutation']);
 assert.ok(fresh.sourceRecordIds.includes('canonical:payment:1')); assert.ok(fresh.sourceRecordIds.includes('canonical:economics:1'));
 const stale=service.auditView({actorId:actor,grantIds:[auditGrant],at:'2026-09-10T10:10:00Z'},target,60_000);
 assert.equal(stale.stale,true); assert.equal(stale.domainSnapshots.length,7);
});

test('SW1-09 rejects semantically mismatched or future-dated audit-source state',()=>{
 const mismatch={domain:'PAYMENT',read:targetId=>({domain:'INVENTORY',targetId,currentState:{},sourceRecordIds:['canonical:mismatch'],observedAt:at})};
 const {service:badDomain,auditGrant}=setup([mismatch]);
 assert.throws(()=>badDomain.auditView({actorId:actor,grantIds:[auditGrant],at:'2026-09-10T10:00:30Z'},target,60_000),/AUDIT_SOURCE_SEMANTIC_MISMATCH/);
 const future={domain:'PAYMENT',read:targetId=>({domain:'PAYMENT',targetId,currentState:{},sourceRecordIds:['canonical:future'],observedAt:'2026-09-10T11:00:00Z'})};
 const {service:badTime,auditGrant:auditGrant2}=setup([future]);
 assert.throws(()=>badTime.auditView({actorId:actor,grantIds:[auditGrant2],at:'2026-09-10T10:00:30Z'},target,60_000),/AUDIT_SOURCE_TIME_INVALID/);
});
