import assert from 'node:assert/strict';
import pg from 'pg';
import {PostgresDurableCommandStore} from '../dist/packages/durability/src/postgres.js';

const {Pool}=pg;
const connectionString=process.env.DATABASE_URL??'postgresql://postgres:postgres@localhost:5432/foodclub_test';
const pool=new Pool({connectionString,max:20});
const adaptedPool={
  async connect(){
    const client=await pool.connect();
    return {query:(sql,params)=>client.query(sql,params),release:()=>client.release()};
  }
};
const fixed=()=>new Date('2026-09-09T16:30:00Z');
const claimState=x=>typeof x==='string'?x:x?.state;

try{
  await pool.query("DELETE FROM durable_command_execution WHERE idempotency_key LIKE 'idem:adapter-race:%'");

  const freshStores=Array.from({length:5},()=>new PostgresDurableCommandStore(adaptedPool,'worker:same-owner',60_000,fixed));
  const fresh=await Promise.all(freshStores.map(s=>s.claimFenced('idem:adapter-race:fresh','cmd:adapter-race:fresh')));
  assert.equal(fresh.filter(x=>claimState(x)==='CLAIMED').length,1,'fresh five-way race must grant exactly one CLAIMED');
  assert.equal(fresh.filter(x=>claimState(x)==='IN_FLIGHT').length,4,'fresh five-way race must return four IN_FLIGHT');

  const activeAgain=await freshStores[0].claimFenced('idem:adapter-race:fresh','cmd:adapter-race:fresh');
  assert.equal(claimState(activeAgain),'IN_FLIGHT','same instance must not be silently re-granted an active claim');

  await pool.query(`INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,created_at,updated_at)
    VALUES($1,$2,'IN_FLIGHT',$3,$4,1,$5,$5)`,[
      'idem:adapter-race:takeover','cmd:adapter-race:takeover','worker:same-owner','2026-09-09T16:29:00.000Z','2026-09-09T16:28:00.000Z'
    ]);
  const takeoverStores=Array.from({length:3},()=>new PostgresDurableCommandStore(adaptedPool,'worker:same-owner',60_000,fixed));
  const takeover=await Promise.all(takeoverStores.map(s=>s.claimFenced('idem:adapter-race:takeover','cmd:adapter-race:takeover')));
  assert.equal(takeover.filter(x=>claimState(x)==='CLAIMED').length,1,'expired-lease takeover race must grant exactly one CLAIMED');
  assert.equal(takeover.filter(x=>claimState(x)==='IN_FLIGHT').length,2,'expired-lease takeover race must return two IN_FLIGHT');
  const row=(await pool.query("SELECT owner_token,fence_generation,state FROM durable_command_execution WHERE idempotency_key='idem:adapter-race:takeover'")).rows[0];
  assert.equal(Number(row.fence_generation),2,'winning takeover must increment the fence generation exactly once');
  assert.equal(row.owner_token,'worker:same-owner');
  assert.equal(row.state,'IN_FLIGHT');

  console.log('live PostgresDurableCommandStore same-owner race proof passed');
} finally {
  await pool.end();
}
