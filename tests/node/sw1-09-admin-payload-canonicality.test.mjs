import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {GovernedPilotOperationsService} from '../../dist/packages/pilot-operations/src/index.js';

const pid=value=>asId(value),gid=value=>asId(value);
const actor=pid('participant:admin-canonicality');
const target='obligation:canonical-payload';
const at='2026-09-10T10:00:00Z';

function setup(){
 const store=new InMemoryAuthorityStore();
 const grantId=gid('grant:admin-canonicality');
 store.put({id:grantId,grantorId:pid('participant:club'),actorId:actor,actions:['admin.obligation.annotate'],targetPrefix:'obligation:',validFrom:'2026-09-10T00:00:00Z'});
 return {service:new GovernedPilotOperationsService(new AuthorityEvaluator(store)),grantId};
}

function execute(service,grantId,requestId,payload,mutate=()=>({result:{ok:true},sourceRecordIds:['canonical:effect']})){
 return service.executeMutation(
  {actorId:actor,grantIds:[grantId],at},
  {requestId,action:'admin.obligation.annotate',targetId:target,reason:'canonical payload regression',payload},
  mutate,
 );
}

test('SW1-09 admin operations reject non-JSON-canonical payload values instead of corrupting or colliding them',()=>{
 const cases=[
  ['date',new Date('2026-01-01T00:00:00Z')],
  ['map',new Map([['a',1]])],
  ['set',new Set(['a'])],
  ['regexp',/food-club/i],
  ['typed-array',new Uint8Array([1,2,3])],
  ['nan',Number.NaN],
  ['infinity',Number.POSITIVE_INFINITY],
  ['undefined',undefined],
 ];
 for(const [name,payload] of cases){
  const {service,grantId}=setup(); let effects=0;
  assert.throws(()=>execute(service,grantId,`req:${name}`,{value:payload},()=>({result:{effect:++effects},sourceRecordIds:[`canonical:${name}`]})),/ADMIN_PAYLOAD_NOT_CANONICAL/);
  assert.equal(effects,0,name);
 }
});

test('SW1-09 rejects sparse and cyclic payloads before fingerprinting',()=>{
 const {service,grantId}=setup();
 const sparse=[]; sparse[1]='x';
 assert.throws(()=>execute(service,grantId,'req:sparse',{value:sparse}),/ADMIN_PAYLOAD_NOT_CANONICAL/);
 const cyclic={name:'cycle'}; cyclic.self=cyclic;
 assert.throws(()=>execute(service,grantId,'req:cycle',cyclic),/ADMIN_PAYLOAD_NOT_CANONICAL/);
});

test('SW1-09 distinct Date payloads cannot collide under the same request id because both fail closed',()=>{
 const {service,grantId}=setup(); let effects=0;
 const base={requestId:'req:date-collision',action:'admin.obligation.annotate',targetId:target,reason:'reschedule'};
 const ctx={actorId:actor,grantIds:[grantId],at};
 assert.throws(()=>service.executeMutation(ctx,{...base,payload:{scheduledFor:new Date('1950-01-01T00:00:00Z')}},()=>({result:{effect:++effects},sourceRecordIds:['canonical:first']})),/ADMIN_PAYLOAD_NOT_CANONICAL/);
 assert.throws(()=>service.executeMutation(ctx,{...base,payload:{scheduledFor:new Date('2050-01-01T00:00:00Z')}},()=>({result:{effect:++effects},sourceRecordIds:['canonical:second']})),/ADMIN_PAYLOAD_NOT_CANONICAL/);
 assert.equal(effects,0);
});

test('SW1-09 canonical JSON payloads retain deterministic idempotency semantics',()=>{
 const {service,grantId}=setup(); let effects=0;
 const payload={note:'checked',count:2,flags:[true,false],nested:{value:null}};
 const first=execute(service,grantId,'req:json',payload,()=>({result:{effect:++effects},sourceRecordIds:['canonical:json']}));
 const replay=execute(service,grantId,'req:json',{nested:{value:null},flags:[true,false],count:2,note:'checked'},()=>({result:{effect:++effects},sourceRecordIds:['canonical:json:unexpected']}));
 assert.deepEqual(replay,first);
 assert.equal(effects,1);
});
