import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryAtomicCommandStore} from '../../dist/packages/durability/src/index.js';

const accepted={status:'ACCEPTED',eventIds:['event:1'],replayed:false};

test('INV-027 atomic claim prevents concurrent duplicate execution ownership',async()=>{
 const store=new InMemoryAtomicCommandStore();
 const [a,b]=await Promise.all([store.claim('idem:1','cmd:1'),store.claim('idem:1','cmd:1')]);
 assert.deepEqual(new Set([a,b]),new Set(['CLAIMED','IN_FLIGHT']));
 await store.commit('idem:1','cmd:1',accepted);
 const replay=await store.claim('idem:1','cmd:1');
 assert.equal(replay.status,'ACCEPTED'); assert.equal(replay.replayed,true); assert.deepEqual(replay.eventIds,['event:1']);
});

test('INV-027 one idempotency key cannot alias a different command',async()=>{
 const store=new InMemoryAtomicCommandStore(); await store.claim('idem:shared','cmd:a');
 await assert.rejects(()=>store.claim('idem:shared','cmd:b'),/IDEMPOTENCY_KEY_COMMAND_CONFLICT/);
});

test('failed uncommitted execution can abandon claim and retry without manufacturing a result',async()=>{
 const store=new InMemoryAtomicCommandStore(); assert.equal(await store.claim('idem:retry','cmd:retry'),'CLAIMED');
 await store.abandon('idem:retry','cmd:retry'); assert.equal(await store.claim('idem:retry','cmd:retry'),'CLAIMED');
});

test('commit requires ownership of the durable claim',async()=>{
 const store=new InMemoryAtomicCommandStore();
 await assert.rejects(()=>store.commit('idem:none','cmd:none',accepted),/DURABLE_CLAIM_REQUIRED/);
});
