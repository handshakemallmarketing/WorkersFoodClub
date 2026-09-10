import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {GovernedPilotOperationsService} from '../../dist/packages/pilot-operations/src/index.js';

const pid=x=>asId(x),gid=x=>asId(x);
const actor=pid('participant:rc1-admin');
const club=pid('participant:food-club');
const target='obligation:rc1-recovery';
const at='2026-09-10T10:30:00Z';

function setup(){
 const store=new InMemoryAuthorityStore();
 const adminGrant=gid('grant:rc1-admin-mutate');
 const recoveryGrant=gid('grant:rc1-recovery');
 store.put({id:adminGrant,grantorId:club,actorId:actor,actions:['admin.obligation.annotate'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 store.put({id:recoveryGrant,grantorId:club,actorId:actor,actions:['admin.recovery.reconcile'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 return {service:new GovernedPilotOperationsService(new AuthorityEvaluator(store)),adminGrant,recoveryGrant};
}

const forgedRequest={requestId:'req:forged-recovery',action:'admin.recovery.reconcile',targetId:target,reason:'try direct recovery mutation',payload:{}};

test('SW1-RC1 direct use of the reserved recovery action cannot fabricate a new effect and is audited',()=>{
 const {service,recoveryGrant}=setup(); let effects=0;
 const ctx={actorId:actor,grantIds:[recoveryGrant],at};
 assert.throws(()=>service.executeMutation(ctx,forgedRequest,()=>({result:{ok:true},sourceRecordIds:[`effect:${++effects}`]})),/ADMIN_RECOVERY_DIRECT_MUTATION_FORBIDDEN/);
 assert.equal(effects,0);
 const rejected=service.auditLog().at(-1);
 assert.equal(rejected.outcome,'REJECTED');
 assert.equal(rejected.authorityReason,'RECOVERY_ENTRYPOINT_REQUIRED');
 assert.equal(rejected.requestId,forgedRequest.requestId);
});

test('SW1-RC1 runtime caller cannot spoof the module-private recovery capability symbol',()=>{
 const {service,recoveryGrant}=setup(); let effects=0;
 const ctx={actorId:actor,grantIds:[recoveryGrant],at};
 assert.equal(typeof service.executeMutationInternal,'function');
 assert.throws(()=>service.executeMutationInternal(ctx,{...forgedRequest,requestId:'req:spoofed-recovery'},()=>({result:{ok:true},sourceRecordIds:[`effect:${++effects}`]}),Symbol('governed-recovery-capability')),/ADMIN_RECOVERY_DIRECT_MUTATION_FORBIDDEN/);
 assert.equal(effects,0);
 const rejected=service.auditLog().at(-1);
 assert.equal(rejected.outcome,'REJECTED');
 assert.equal(rejected.authorityReason,'RECOVERY_ENTRYPOINT_REQUIRED');
 assert.equal(rejected.requestId,'req:spoofed-recovery');
});

test('SW1-RC1 governed recover retries only the exact stored failed operation',()=>{
 const {service,adminGrant,recoveryGrant}=setup(); let effects=0;
 assert.throws(()=>service.executeMutation({actorId:actor,grantIds:[adminGrant],at},{requestId:'req:failed-original',action:'admin.obligation.annotate',targetId:target,reason:'original operation',payload:{note:'canonical'}},()=>{
  effects++;
  if(effects===1) throw new Error('PROVIDER_TIMEOUT');
  return {result:{ok:true},sourceRecordIds:['canonical:retried-effect']};
 }),/PROVIDER_TIMEOUT/);
 const result=service.recover({actorId:actor,grantIds:[recoveryGrant],at:'2026-09-10T10:31:00Z'},{recoveryRequestId:'req:governed-recovery',originalRequestId:'req:failed-original',reason:'confirmed no effect',maxAgeMs:120000},()=>({effectObserved:false,sourceRecordIds:['provider:probe:no-effect']}));
 assert.equal(result.disposition,'RETRIED');
 assert.equal(effects,2);
});