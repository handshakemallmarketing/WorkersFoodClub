import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {CommandBus,InMemoryIdempotencyStore,InMemoryVersionStore} from '../../dist/packages/application/src/index.js';

const id=x=>asId(x);
const command=(overrides={})=>({commandId:id('command:rc1b'),idempotencyKey:'idem:rc1b',actorId:id('participant:operator'),action:'AllocateLotQuantity',targetId:'lot:1',expectedVersion:7,authorityGrantIds:[id('grant:rc1b')],evidenceIds:[],policyVersions:['policy:v1'],requestedAt:'2026-09-07T21:00:00Z',correlationId:'corr:rc1b',payload:{},...overrides});
const authority=()=>{const s=new InMemoryAuthorityStore();s.put({id:id('grant:rc1b'),grantorId:id('participant:board'),actorId:id('participant:operator'),actions:['AllocateLotQuantity','ReadCatalog'],targetPrefix:'lot:',validFrom:'2026-09-01T00:00:00Z'});return new AuthorityEvaluator(s);};

test('RC1-B01 consequential classification requires a transactional executor',()=>{
 assert.throws(()=>new CommandBus(authority(),{consequentialActions:['AllocateLotQuantity']}),/TRANSACTIONAL_EXECUTOR_REQUIRED/);
});

test('RC1-B01 consequential action cannot register a legacy mutable handler',()=>{
 const tx={execute:async()=>({status:'ACCEPTED',eventIds:['event:tx'],replayed:false})};
 const bus=new CommandBus(authority(),{consequentialActions:['AllocateLotQuantity'],transactionalExecutor:tx});
 assert.throws(()=>bus.register({action:'AllocateLotQuantity',handle:()=>['event:legacy']}),/CONSEQUENTIAL_HANDLER_MUST_BE_TRANSACTIONAL/);
});

test('INV-027/028 consequential action bypasses legacy idempotency/version path and routes exactly once to transactional executor',async()=>{
 let txCalls=0,legacyGets=0,versionGets=0;
 const idem={get(){legacyGets++;throw new Error('LEGACY_IDEMPOTENCY_PATH_USED');},putIfAbsent(_k,r){return r;}};
 const versions={get(){versionGets++;throw new Error('LEGACY_VERSION_PATH_USED');}};
 const tx={execute:async(cmd)=>{txCalls++;assert.equal(cmd.expectedVersion,7);return {status:'ACCEPTED',eventIds:['event:durable'],replayed:false};}};
 const bus=new CommandBus(authority(),{idempotencyStore:idem,versionStore:versions,consequentialActions:['AllocateLotQuantity'],transactionalExecutor:tx});
 const result=await bus.execute(command());
 assert.equal(result.status,'ACCEPTED');assert.deepEqual(result.eventIds,['event:durable']);assert.equal(txCalls,1);assert.equal(legacyGets,0);assert.equal(versionGets,0);
});

test('non-consequential command retains legacy handler path',async()=>{
 const s=new InMemoryAuthorityStore();s.put({id:id('grant:read'),grantorId:id('participant:board'),actorId:id('participant:operator'),actions:['ReadCatalog'],validFrom:'2026-09-01T00:00:00Z'});
 const bus=new CommandBus(new AuthorityEvaluator(s),{idempotencyStore:new InMemoryIdempotencyStore(),versionStore:new InMemoryVersionStore(),consequentialActions:['AllocateLotQuantity'],transactionalExecutor:{execute:async()=>{throw new Error('TX_SHOULD_NOT_RUN');}}});
 bus.register({action:'ReadCatalog',handle:()=>['event:read']});
 const result=await bus.execute(command({commandId:id('command:read'),idempotencyKey:'idem:read',action:'ReadCatalog',targetId:undefined,expectedVersion:undefined,authorityGrantIds:[id('grant:read')]}));
 assert.equal(result.status,'ACCEPTED');assert.deepEqual(result.eventIds,['event:read']);
});
