import test from 'node:test';
import assert from 'node:assert/strict';
import {PaystackLiveReadinessController} from '../../dist/packages/pilot-payments/src/paystack-live-readiness.js';
import {
 GovernedPaystackLiveAuthorityVerifier,
 GovernedPaystackIndependentWatchdogVerifier
} from '../../dist/packages/pilot-payments/src/paystack-live-evidence.js';

const sha='dded810ee37a38c61afab0f647b701b3fac57805';
const approvedTransaction={reference:'live-approved-ref-001',actorId:'participant:member:001',amountMinor:'100',currency:'GHS'};
const envelope={
 action:'EnablePaystackLiveBoundedTransaction',
 environment:'production',
 candidateSha:sha,
 runtimeSha:sha,
 merchantAccountId:'merchant:paystack:production:expected',
 authorizationExpiresAt:'2026-09-15T01:00:00Z',
 liveFundsAuthorized:true,
 paystackLiveModeAuthorized:true,
 approvedTransaction,
 watchdog:{armed:true,independent:true,expiresAt:'2026-09-15T00:55:00Z'}
};
const authorizationEvidence={
 authorizationId:'authz:paystack-live:bounded:001',
 action:'EnablePaystackLiveBoundedTransaction',
 environment:'production',
 status:'ACTIVE',
 revokedAt:null,
 reservationId:null,
 candidateSha:sha,
 merchantAccountId:envelope.merchantAccountId,
 authorizationExpiresAt:envelope.authorizationExpiresAt,
 liveFundsAuthorized:true,
 paystackLiveModeAuthorized:true,
 approvedTransaction,
 authorizedBy:'participant:willie-adofo',
 authorizationBasis:'Explicit bounded live-payment authorization record'
};
const watchdogEvidence={
 watchdogId:'watchdog:paystack-live:001',
 status:'ARMED',
 candidateSha:sha,
 merchantAccountId:envelope.merchantAccountId,
 expiresAt:envelope.watchdog.expiresAt,
 executorClass:'INDEPENDENT_WATCHDOG',
 containmentAction:'DISABLE_PAYSTACK_LIVE',
 activatingRunnerIndependent:true,
 evidenceSource:'watchdog-service:production'
};

const sameTransaction=(a,b)=>a.reference===b.reference&&a.actorId===b.actorId&&a.amountMinor===b.amountMinor&&a.currency===b.currency;

const makeAuthorizationStore=(initial=authorizationEvidence)=>{
 let record=initial?{...initial,approvedTransaction:{...initial.approvedTransaction}}:undefined;
 let reservations=0;
 return {
  reader:{
   reserveActiveAuthorization(input){
    if(!record||record.status!=='ACTIVE'||record.revokedAt) return undefined;
    if(record.candidateSha!==input.candidateSha||record.merchantAccountId!==input.merchantAccountId||record.authorizationExpiresAt!==input.authorizationExpiresAt||!sameTransaction(record.approvedTransaction,input.approvedTransaction)) return undefined;
    reservations++;
    record={...record,status:'RESERVED',reservationId:`reservation:${reservations}`};
    return {...record,approvedTransaction:{...record.approvedTransaction}};
   },
   claimReservedAuthorization(input){
    if(!record||record.status!=='RESERVED'||record.revokedAt) return undefined;
    if(record.authorizationId!==input.authorizationId||record.reservationId!==input.reservationId||record.candidateSha!==input.candidateSha||record.merchantAccountId!==input.merchantAccountId||record.authorizationExpiresAt!==input.authorizationExpiresAt||!sameTransaction(record.approvedTransaction,input.approvedTransaction)) return undefined;
    record={...record,status:'CLAIMED'};
    return {...record,approvedTransaction:{...record.approvedTransaction}};
   }
  },
  revoke(){if(record) record={...record,status:'REVOKED',revokedAt:'2026-09-14T23:10:00Z'};},
  get(){return record?{...record,approvedTransaction:{...record.approvedTransaction}}:undefined;}
 };
};

const makeWatchdogStore=(initial=watchdogEvidence)=>{
 let record=initial?{...initial}:undefined;
 return {
  reader:{getWatchdogEvidence:()=>record?{...record}:undefined},
  setStatus(status){if(record) record={...record,status};},
  get(){return record?{...record}:undefined;}
 };
};

const claimInput=(reservation)=>({
 authorizationId:authorizationEvidence.authorizationId,
 reservationId:reservation.reservationId,
 candidateSha:sha,
 runtimeSha:sha,
 merchantAccountId:envelope.merchantAccountId,
 authorizationExpiresAt:envelope.authorizationExpiresAt,
 approvedTransaction
});

test('governed authority verifier atomically reserves exact durable authorization evidence',()=>{
 const store=makeAuthorizationStore();
 const verifier=new GovernedPaystackLiveAuthorityVerifier(store.reader);
 const reserved=verifier.reserve(envelope);
 assert.equal(reserved.valid,true);
 assert.equal(reserved.authorizationId,'authz:paystack-live:bounded:001');
 assert.equal(store.get().status,'RESERVED');
});

test('governed authority reservation rejects missing, revoked, rebound, or incomplete evidence',()=>{
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore(null).reader).reserve(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore({...authorizationEvidence,status:'REVOKED',revokedAt:'2026-09-14T23:10:00Z'}).reader).reserve(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore({...authorizationEvidence,candidateSha:'0'.repeat(40)}).reader).reserve(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore({...authorizationEvidence,merchantAccountId:'merchant:other'}).reader).reserve(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore({...authorizationEvidence,authorizationExpiresAt:'2026-09-15T01:01:00Z'}).reader).reserve(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore({...authorizationEvidence,approvedTransaction:{...approvedTransaction,amountMinor:'101'}}).reader).reserve(envelope),{valid:false});
 const incomplete=makeAuthorizationStore({...authorizationEvidence,authorizedBy:''});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(incomplete.reader).reserve(envelope),{valid:false});
});

test('caller envelope substitution is rejected even against otherwise valid governed evidence',()=>{
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore().reader).reserve({...envelope,runtimeSha:'1'.repeat(40)}),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore().reader).reserve({...envelope,approvedTransaction:{...approvedTransaction,reference:'replacement-ref'}}),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(makeAuthorizationStore().reader).reserve({...envelope,liveFundsAuthorized:false}),{valid:false});
});

test('one durable authorization can be reserved only once across controller instances',()=>{
 const store=makeAuthorizationStore();
 const first=new GovernedPaystackLiveAuthorityVerifier(store.reader).reserve(envelope);
 const second=new GovernedPaystackLiveAuthorityVerifier(store.reader).reserve(envelope);
 assert.equal(first.valid,true);
 assert.deepEqual(second,{valid:false});
 assert.equal(store.get().status,'RESERVED');
});

test('reserved authorization is atomically consumed exactly once at claim',()=>{
 const store=makeAuthorizationStore();
 const verifier=new GovernedPaystackLiveAuthorityVerifier(store.reader);
 const reserved=verifier.reserve(envelope);
 assert.equal(reserved.valid,true);
 const first=verifier.claim(claimInput(reserved));
 const second=verifier.claim(claimInput(reserved));
 assert.deepEqual(first,{valid:true});
 assert.deepEqual(second,{valid:false});
 assert.equal(store.get().status,'CLAIMED');
});

test('revocation after reserve but before claim fails closed',()=>{
 const store=makeAuthorizationStore();
 const verifier=new GovernedPaystackLiveAuthorityVerifier(store.reader);
 const reserved=verifier.reserve(envelope);
 assert.equal(reserved.valid,true);
 store.revoke();
 assert.deepEqual(verifier.claim(claimInput(reserved)),{valid:false});
 assert.equal(store.get().status,'REVOKED');
});

test('independent watchdog verifier accepts exact independently enforced containment evidence',()=>{
 const store=makeWatchdogStore();
 const verifier=new GovernedPaystackIndependentWatchdogVerifier(store.reader);
 assert.deepEqual(verifier.verify({candidateSha:sha,merchantAccountId:envelope.merchantAccountId,expiresAt:envelope.watchdog.expiresAt}),{valid:true,watchdogId:'watchdog:paystack-live:001'});
});

test('independent watchdog verifier rejects missing, inactive, non-independent, rebound, or malformed evidence',()=>{
 const input={candidateSha:sha,merchantAccountId:envelope.merchantAccountId,expiresAt:envelope.watchdog.expiresAt};
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(makeWatchdogStore(null).reader).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(makeWatchdogStore({...watchdogEvidence,status:'EXPIRED'}).reader).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(makeWatchdogStore({...watchdogEvidence,activatingRunnerIndependent:false}).reader).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(makeWatchdogStore({...watchdogEvidence,candidateSha:'f'.repeat(40)}).reader).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(makeWatchdogStore({...watchdogEvidence,merchantAccountId:'merchant:wrong'}).reader).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(makeWatchdogStore({...watchdogEvidence,evidenceSource:''}).reader).verify(input),{valid:false});
});

test('controller revalidates both durable authority and watchdog immediately before claim',()=>{
 const authorityStore=makeAuthorizationStore();
 const watchdogStore=makeWatchdogStore();
 const control=new PaystackLiveReadinessController(
  new GovernedPaystackLiveAuthorityVerifier(authorityStore.reader),
  new GovernedPaystackIndependentWatchdogVerifier(watchdogStore.reader),
  ()=>'2026-09-14T23:00:00Z'
 );
 control.arm(envelope);
 watchdogStore.setStatus('FAILED');
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,candidateSha:sha,merchantAccountId:envelope.merchantAccountId}),/PAYSTACK_LIVE_WATCHDOG_REVALIDATION_FAILED/);
 assert.equal(control.snapshot().switchState,'OFF');
 assert.equal(control.snapshot().incidentState,'CONTAINMENT_UNPROVEN');
});

test('controller blocks claim when durable authorization is revoked after arming',()=>{
 const authorityStore=makeAuthorizationStore();
 const watchdogStore=makeWatchdogStore();
 const control=new PaystackLiveReadinessController(
  new GovernedPaystackLiveAuthorityVerifier(authorityStore.reader),
  new GovernedPaystackIndependentWatchdogVerifier(watchdogStore.reader),
  ()=>'2026-09-14T23:00:00Z'
 );
 control.arm(envelope);
 authorityStore.revoke();
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,candidateSha:sha,merchantAccountId:envelope.merchantAccountId}),/PAYSTACK_LIVE_AUTHORIZATION_REVALIDATION_FAILED/);
 assert.equal(control.snapshot().switchState,'OFF');
});
