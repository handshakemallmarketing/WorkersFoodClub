import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {PostgresDurableCommandStore} from '../dist/packages/durability/src/postgres.js';
import {PostgresPaystackLiveGovernanceEvidenceStore} from '../dist/packages/pilot-payments/src/paystack-live-postgres.js';

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

const candidateSha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const merchantAccountId='merchant:test:paystack';
const authorizationExpiresAt='2099-09-15T01:00:00.000Z';
const watchdogExpiresAt='2099-09-15T00:55:00.000Z';
const approvedTransaction={reference:'live-approved-ref-race-001',actorId:'participant:test:001',amountMinor:'100',currency:'GHS'};
const envelope={
  action:'EnablePaystackLiveBoundedTransaction',environment:'production',candidateSha,runtimeSha:candidateSha,
  merchantAccountId,authorizationExpiresAt,liveFundsAuthorized:true,paystackLiveModeAuthorized:true,
  approvedTransaction,watchdog:{armed:true,independent:true,expiresAt:watchdogExpiresAt}
};

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

  const paystackSchema=await readFile(new URL('../packages/durability/sql/010_paystack_live_governance_evidence.sql',import.meta.url),'utf8');
  await pool.query(paystackSchema);
  await pool.query('TRUNCATE paystack_live_authorization_evidence, paystack_live_watchdog_evidence');
  await pool.query(`INSERT INTO paystack_live_authorization_evidence
    (authorization_id,action,environment,status,candidate_sha,merchant_account_id,authorization_expires_at,
     live_funds_authorized,paystack_live_mode_authorized,approved_reference,approved_actor_id,approved_amount_minor,
     approved_currency,authorized_by,authorization_basis)
    VALUES($1,'EnablePaystackLiveBoundedTransaction','production','ACTIVE',$2,$3,$4,true,true,$5,$6,$7,'GHS',$8,$9)`,[
      'authz:race:001',candidateSha,merchantAccountId,authorizationExpiresAt,approvedTransaction.reference,
      approvedTransaction.actorId,approvedTransaction.amountMinor,'participant:test-authorizer','postgres-race-proof'
    ]);
  await pool.query(`INSERT INTO paystack_live_watchdog_evidence
    (watchdog_id,status,candidate_sha,merchant_account_id,expires_at,executor_class,containment_action,
     activating_runner_independent,evidence_source)
    VALUES($1,'ARMED',$2,$3,$4,'INDEPENDENT_WATCHDOG','DISABLE_PAYSTACK_LIVE',true,$5)`,[
      'watchdog:race:001',candidateSha,merchantAccountId,watchdogExpiresAt,'independent-test-runner'
    ]);

  const evidenceStores=Array.from({length:5},()=>new PostgresPaystackLiveGovernanceEvidenceStore(adaptedPool));
  const reservations=await Promise.all(evidenceStores.map(store=>store.reserveActiveAuthorization(envelope)));
  const winners=reservations.filter(Boolean);
  assert.equal(winners.length,1,'five-way Paystack authorization race must create exactly one durable reservation');
  const reservation=winners[0];
  assert.equal(reservation.status,'RESERVED');
  assert.ok(reservation.reservationId);

  const claimInput={
    authorizationId:reservation.authorizationId,reservationId:reservation.reservationId,candidateSha,runtimeSha:candidateSha,
    merchantAccountId,authorizationExpiresAt,watchdogId:'watchdog:race:001',watchdogExpiresAt,approvedTransaction
  };
  const claims=await Promise.all(evidenceStores.map(store=>store.claimReservedAuthorization(claimInput)));
  assert.equal(claims.filter(Boolean).length,1,'five-way Paystack claim race must consume the durable authorization exactly once');
  assert.equal(claims.find(Boolean).status,'CLAIMED');

  const watchdog=await evidenceStores[0].getWatchdogEvidence({candidateSha,merchantAccountId,expiresAt:watchdogExpiresAt});
  assert.equal(watchdog?.status,'ARMED');
  assert.equal(watchdog?.watchdogId,'watchdog:race:001');
  assert.equal(await evidenceStores[0].getWatchdogEvidence({candidateSha,merchantAccountId:'merchant:wrong',expiresAt:watchdogExpiresAt}),undefined);

  await pool.query(`INSERT INTO paystack_live_authorization_evidence
    (authorization_id,action,environment,status,candidate_sha,merchant_account_id,authorization_expires_at,
     live_funds_authorized,paystack_live_mode_authorized,approved_reference,approved_actor_id,approved_amount_minor,
     approved_currency,authorized_by,authorization_basis)
    VALUES($1,'EnablePaystackLiveBoundedTransaction','production','ACTIVE',$2,$3,$4,true,true,$5,$6,$7,'GHS',$8,$9)`,[
      'authz:revoke:001',candidateSha,merchantAccountId,authorizationExpiresAt,'live-approved-ref-revoke-001',
      approvedTransaction.actorId,approvedTransaction.amountMinor,'participant:test-authorizer','postgres-revocation-proof'
    ]);
  const revokeEnvelope={...envelope,approvedTransaction:{...approvedTransaction,reference:'live-approved-ref-revoke-001'}};
  const reservedForRevoke=await evidenceStores[0].reserveActiveAuthorization(revokeEnvelope);
  assert.equal(reservedForRevoke?.status,'RESERVED');
  await pool.query("UPDATE paystack_live_authorization_evidence SET status='REVOKED',revoked_at=now(),updated_at=now() WHERE authorization_id='authz:revoke:001'");
  const revokedClaim=await evidenceStores[0].claimReservedAuthorization({
    authorizationId:'authz:revoke:001',reservationId:reservedForRevoke.reservationId,candidateSha,runtimeSha:candidateSha,
    merchantAccountId,authorizationExpiresAt,watchdogId:'watchdog:race:001',watchdogExpiresAt,approvedTransaction:revokeEnvelope.approvedTransaction
  });
  assert.equal(revokedClaim,undefined,'revocation between reservation and claim must fail closed');

  await pool.query(`INSERT INTO paystack_live_authorization_evidence
    (authorization_id,action,environment,status,candidate_sha,merchant_account_id,authorization_expires_at,
     live_funds_authorized,paystack_live_mode_authorized,approved_reference,approved_actor_id,approved_amount_minor,
     approved_currency,authorized_by,authorization_basis)
    VALUES($1,'EnablePaystackLiveBoundedTransaction','production','ACTIVE',$2,$3,$4,true,true,$5,$6,$7,'GHS',$8,$9)`,[
      'authz:watchdog-failed:001',candidateSha,merchantAccountId,authorizationExpiresAt,'live-approved-ref-watchdog-failed-001',
      approvedTransaction.actorId,approvedTransaction.amountMinor,'participant:test-authorizer','postgres-watchdog-atomic-proof'
    ]);
  const watchdogFailEnvelope={...envelope,approvedTransaction:{...approvedTransaction,reference:'live-approved-ref-watchdog-failed-001'}};
  const reservedForWatchdogFail=await evidenceStores[0].reserveActiveAuthorization(watchdogFailEnvelope);
  assert.equal(reservedForWatchdogFail?.status,'RESERVED');
  await pool.query("UPDATE paystack_live_watchdog_evidence SET status='FAILED',updated_at=now() WHERE watchdog_id='watchdog:race:001'");
  const watchdogFailedClaim=await evidenceStores[0].claimReservedAuthorization({authorizationId:'authz:watchdog-failed:001',reservationId:reservedForWatchdogFail.reservationId,candidateSha,runtimeSha:candidateSha,merchantAccountId,authorizationExpiresAt,watchdogId:'watchdog:race:001',watchdogExpiresAt,approvedTransaction:watchdogFailEnvelope.approvedTransaction});
  assert.equal(watchdogFailedClaim,undefined,'watchdog failure between precheck and authorization claim must fail closed atomically');
  const watchdogFailedRow=(await pool.query("SELECT status FROM paystack_live_authorization_evidence WHERE authorization_id='authz:watchdog-failed:001'")).rows[0];
  assert.equal(watchdogFailedRow.status,'RESERVED','failed watchdog claim must not consume authorization');

  console.log('live PostgreSQL durability and Paystack governance evidence race proof passed');
} finally {
  await pool.end();
}
