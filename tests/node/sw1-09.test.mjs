import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {GovernedPilotOperationsService} from '../../dist/packages/pilot-operations/src/index.js';

const pid=x=>asId(x),gid=x=>asId(x);
const actor=pid('participant:admin-1');
const target='obligation:sw1-09';
const at='2026-09-10T10:00:00Z';
function setup(){
 const store=new InMemoryAuthorityStore();
 const adminGrant=gid('grant:admin');
 const recoveryGrant=gid('grant:recovery');
 store.put({id:adminGrant,grantorId:pid('participant:club'),actorId:actor,actions:['admin.obligation.annotate'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 store.put({id:recoveryGrant,grantorId:pid('participant:club'),actorId:actor,actions:['admin.recovery.reconcile'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 return {service:new GovernedPilotOperationsService(new AuthorityEvaluator(store)),adminGrant,recoveryGrant};
}

test('SW1-09 rejects unauthorized admin mutation and records the rejected attempt',()=>{
 const {service}=setup();
 assert.throws(()=>service.executeMutation({actorId:actor,grantIds:[],at},{requestId:'req:unauthorized',action:'admin.obligation.annotate',targetId:target,reason:'operator note',payload:{note:'x'}},()=>({ok:true})),/ADMIN_UNAUTHORIZED/);
 const log=service.auditLog();
 assert.equal(log.length,1); assert.equal(log[0].outcome,'REJECTED'); assert.equal(log[0].authorityReason,'NO_GRANT');
});

test('SW1-09 accepted admin request is idempotent and conflicting request reuse fails closed',()=>{
 const {service,adminGrant}=setup(); let effects=0;
 const ctx={actorId:actor,grantIds:[adminGrant],at};
 const request={requestId:'req:1',action:'admin.obligation.annotate',targetId:target,reason:'investigate mismatch',payload:{note:'checked'}};
 const first=service.executeMutation(ctx,request,()=>({effect:++effects}));
 const replay=service.executeMutation(ctx,request,()=>({effect:++effects}));
 assert.deepEqual(replay,first); assert.equal(effects,1);
 assert.throws(()=>service.executeMutation(ctx,{...request,payload:{note:'tampered'}},()=>({effect:++effects})),/ADMIN_REQUEST_ID_CONFLICT/);
 assert.equal(service.auditLog().at(-1).outcome,'REPLAYED');
});

test('SW1-09 failed mutation cannot be blindly retried under the same request id',()=>{
 const {service,adminGrant}=setup(); let effects=0;
 const ctx={actorId:actor,grantIds:[adminGrant],at};
 const request={requestId:'req:failed',action:'admin.obligation.annotate',targetId:target,reason:'repair',payload:{}};
 assert.throws(()=>service.executeMutation(ctx,request,()=>{effects++;throw new Error('DEPENDENCY_DOWN');}),/DEPENDENCY_DOWN/);
 assert.throws(()=>service.executeMutation(ctx,request,()=>{effects++;return {ok:true};}),/ADMIN_REQUEST_REJECTED/);
 assert.equal(effects,1);
});

test('SW1-09 bounded recovery is authorized, stale-safe, and replay-safe',()=>{
 const {service,adminGrant,recoveryGrant}=setup();
 service.executeMutation({actorId:actor,grantIds:[adminGrant],at},{requestId:'req:original',action:'admin.obligation.annotate',targetId:target,reason:'canonical op',payload:{}},()=>({ok:true}));
 let reconciliations=0;
 const recoveryCtx={actorId:actor,grantIds:[recoveryGrant],at:'2026-09-10T10:05:00Z'};
 const input={recoveryRequestId:'req:recover',originalRequestId:'req:original',reason:'verify provider outcome',maxAgeMs:10*60*1000};
 const first=service.recover(recoveryCtx,input,()=>{reconciliations++;return {disposition:'ALREADY_APPLIED',sourceRecordIds:['canonical:1']};});
 const replay=service.recover(recoveryCtx,input,()=>{reconciliations++;return {disposition:'APPLIED_NOW',sourceRecordIds:['canonical:2']};});
 assert.deepEqual(replay,first); assert.equal(reconciliations,1);
 assert.throws(()=>service.recover({...recoveryCtx,at:'2026-09-10T12:00:00Z'},{...input,recoveryRequestId:'req:stale'},()=>({disposition:'NO_EFFECT',sourceRecordIds:[]})),/RECOVERY_STALE/);
});

test('SW1-09 audit view is read-only, lineage-bearing, and discloses freshness',()=>{
 const {service,adminGrant}=setup();
 service.executeMutation({actorId:actor,grantIds:[adminGrant],at},{requestId:'req:view',action:'admin.obligation.annotate',targetId:target,reason:'audit source',payload:{}},()=>({ok:true}));
 const fresh=service.auditView(target,'2026-09-10T10:00:30Z',60_000);
 assert.equal(fresh.authoritative,false); assert.equal(fresh.stale,false); assert.equal(fresh.sourceRecordIds.length,1);
 const stale=service.auditView(target,'2026-09-10T10:10:00Z',60_000);
 assert.equal(stale.stale,true); assert.equal(stale.records.length,1);
});
