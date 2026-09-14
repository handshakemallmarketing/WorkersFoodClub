import test from 'node:test';
import assert from 'node:assert/strict';
import {PaystackLiveReadinessController,PaystackExactReferenceReconciler} from '../../dist/packages/pilot-payments/src/paystack-live-readiness.js';

const sha='1995b2d3a86b9efa3bb56d77b81eb5a4693ce441';
const approvedTransaction={reference:'live-ref-1',actorId:'participant:member:001',amountMinor:'100',currency:'GHS'};
const baseEnvelope={
 action:'EnablePaystackLiveBoundedTransaction',
 environment:'production',
 candidateSha:sha,
 runtimeSha:sha,
 merchantAccountId:'merchant:paystack:production:expected',
 authorizationExpiresAt:'2026-09-15T00:30:00Z',
 liveFundsAuthorized:true,
 paystackLiveModeAuthorized:true,
 approvedTransaction,
 watchdog:{armed:true,independent:true,expiresAt:'2026-09-15T00:20:00Z'}
};
const validAuthority={verify:()=>Object.freeze({valid:true,authorizationId:'authz:bounded-live:001'})};
const validWatchdog={verify:()=>Object.freeze({valid:true,watchdogId:'watchdog:external:001'})};
const clockAt=value=>()=>value;
const makeControl=(authority=validAuthority,watchdog=validWatchdog,clock=clockAt('2026-09-14T23:00:00Z'))=>new PaystackLiveReadinessController(authority,watchdog,clock);

test('Paystack live readiness control defaults OFF',()=>{
 const control=makeControl();
 assert.deepEqual(control.snapshot(),{switchState:'OFF',incidentState:'NONE'});
});

test('Paystack live readiness control requires both live-mode and live-funds authorization',()=>{
 const control=makeControl();
 assert.throws(()=>control.arm({...baseEnvelope,liveFundsAuthorized:false}),/PAYSTACK_LIVE_AUTHORIZATION_INCOMPLETE/);
 assert.throws(()=>control.arm({...baseEnvelope,paystackLiveModeAuthorized:false}),/PAYSTACK_LIVE_AUTHORIZATION_INCOMPLETE/);
 assert.deepEqual(control.snapshot(),{switchState:'OFF',incidentState:'NONE'});
});

test('Paystack live readiness control rejects caller assertions without independently verified authority evidence',()=>{
 const invalidAuthority={verify:()=>Object.freeze({valid:false})};
 const control=makeControl(invalidAuthority);
 assert.throws(()=>control.arm(baseEnvelope),/PAYSTACK_LIVE_AUTHORIZATION_EVIDENCE_INVALID/);
 assert.deepEqual(control.snapshot(),{switchState:'OFF',incidentState:'NONE'});
});

test('Paystack live readiness control rejects watchdog assertions without independent watchdog evidence',()=>{
 const invalidWatchdog={verify:()=>Object.freeze({valid:false})};
 const control=makeControl(validAuthority,invalidWatchdog);
 assert.throws(()=>control.arm(baseEnvelope),/PAYSTACK_LIVE_WATCHDOG_EVIDENCE_INVALID/);
 assert.deepEqual(control.snapshot(),{switchState:'OFF',incidentState:'NONE'});
});

test('Paystack live readiness control binds candidate SHA, merchant, expiry and independent watchdog',()=>{
 const control=makeControl();
 assert.throws(()=>control.arm({...baseEnvelope,runtimeSha:'0'.repeat(40)}),/PAYSTACK_LIVE_RUNTIME_SHA_MISMATCH/);
 assert.throws(()=>control.arm({...baseEnvelope,watchdog:{...baseEnvelope.watchdog,independent:false}}),/PAYSTACK_LIVE_INDEPENDENT_WATCHDOG_REQUIRED/);
 const armed=control.arm(baseEnvelope);
 assert.equal(armed.switchState,'ARMED');
 assert.equal(armed.incidentState,'NONE');
 assert.equal(armed.authorizationId,'authz:bounded-live:001');
 assert.equal(armed.watchdogId,'watchdog:external:001');
});

test('One authorization is bound to one immutable approved transaction and can be claimed only once',()=>{
 const control=makeControl();
 control.arm(baseEnvelope);
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,candidateSha:'1'.repeat(40),merchantAccountId:baseEnvelope.merchantAccountId}),/PAYSTACK_LIVE_CANDIDATE_REBOUND/);
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,candidateSha:sha,merchantAccountId:'merchant:wrong'}),/PAYSTACK_LIVE_MERCHANT_REBOUND/);
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,reference:'live-ref-substituted',candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId}),/PAYSTACK_LIVE_TRANSACTION_REBOUND/);
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,actorId:'participant:other',candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId}),/PAYSTACK_LIVE_TRANSACTION_REBOUND/);
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,amountMinor:'101',candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId}),/PAYSTACK_LIVE_TRANSACTION_REBOUND/);
 const claimed=control.claimBoundedTransaction({...approvedTransaction,candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId});
 assert.equal(claimed.switchState,'TRANSACTION_CLAIMED');
 assert.throws(()=>control.claimBoundedTransaction({...approvedTransaction,candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId}),/PAYSTACK_LIVE_TRANSACTION_ALREADY_CLAIMED/);
});

test('State observation fails closed after watchdog expiry even if no transaction method runs',()=>{
 let now='2026-09-14T23:00:00Z';
 const control=makeControl(validAuthority,validWatchdog,()=>now);
 control.arm(baseEnvelope);
 assert.equal(control.snapshot().switchState,'ARMED');
 now='2026-09-15T00:20:00Z';
 assert.equal(control.snapshot().switchState,'OFF');
});

test('Unresolved transaction and containment incidents remain sticky across disable',()=>{
 const control=makeControl();
 control.arm(baseEnvelope);
 control.markTransactionOutcomeUnresolved();
 let snapshot=control.disable();
 assert.equal(snapshot.switchState,'OFF');
 assert.equal(snapshot.incidentState,'TRANSACTION_OUTCOME_UNRESOLVED');
 assert.throws(()=>control.arm(baseEnvelope),/PAYSTACK_LIVE_INCIDENT_UNRESOLVED/);
 snapshot=control.markContainmentUnproven();
 assert.equal(snapshot.incidentState,'CONTAINMENT_UNPROVEN');
 snapshot=control.disable();
 assert.equal(snapshot.switchState,'OFF');
 assert.equal(snapshot.incidentState,'CONTAINMENT_UNPROVEN');
});

const verification=(reference,state,minor=100n)=>Object.freeze({
 provider:'PAYSTACK',providerReference:reference,rawStatus:state.toLowerCase(),state,
 amount:Object.freeze({minor,currency:'GHS'}),occurredAt:'2026-09-14T23:00:00Z'
});
const canonical=(reference,status,minor=100n)=>Object.freeze({providerReference:reference,status,amount:Object.freeze({minor,currency:'GHS'})});

test('Exact-reference reconciler resolves only when provider and canonical evidence agree',async()=>{
 let calls=0;
 const adapter={verifyPayment:async reference=>{calls++;return calls===1?verification(reference,'PENDING'):verification(reference,'CONFIRMED');}};
 const reader={getByProviderReference:reference=>canonical(reference,'CONFIRMED')};
 const result=await new PaystackExactReferenceReconciler(adapter,reader).reconcile('live-ref-42',3,100);
 assert.equal(result.state,'RESOLVED_CONFIRMED');
 assert.equal(result.reference,'live-ref-42');
 assert.equal(result.attempts,2);
 assert.equal(result.retryAllowed,false);
});

test('Terminal provider outcome remains unresolved when canonical evidence is missing',async()=>{
 const adapter={verifyPayment:async reference=>verification(reference,'CONFIRMED')};
 const reader={getByProviderReference:()=>undefined};
 const result=await new PaystackExactReferenceReconciler(adapter,reader).reconcile('live-ref-43',2,100);
 assert.equal(result.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(result.lastCanonicalIssue,'CANONICAL_PAYMENT_EVIDENCE_MISSING');
 assert.equal(result.retryAllowed,false);
});

test('Terminal provider outcome remains unresolved when canonical state or amount diverges',async()=>{
 const adapter={verifyPayment:async reference=>verification(reference,'CONFIRMED')};
 const statusReader={getByProviderReference:reference=>canonical(reference,'FAILED')};
 const statusResult=await new PaystackExactReferenceReconciler(adapter,statusReader).reconcile('live-ref-44',1,100);
 assert.equal(statusResult.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(statusResult.lastCanonicalIssue,'CANONICAL_PAYMENT_STATUS_MISMATCH');
 const amountReader={getByProviderReference:reference=>canonical(reference,'CONFIRMED',101n)};
 const amountResult=await new PaystackExactReferenceReconciler(adapter,amountReader).reconcile('live-ref-44',1,100);
 assert.equal(amountResult.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(amountResult.lastCanonicalIssue,'CANONICAL_PAYMENT_AMOUNT_MISMATCH');
});

test('Exact-reference reconciler preserves unresolved outcome after bounded pending/ambiguous observations',async()=>{
 let calls=0;
 const adapter={verifyPayment:async reference=>{calls++;return verification(reference,calls===1?'PENDING':'AMBIGUOUS');}};
 const reader={getByProviderReference:()=>undefined};
 const result=await new PaystackExactReferenceReconciler(adapter,reader).reconcile('live-ref-45',2,100);
 assert.equal(result.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(result.reference,'live-ref-45');
 assert.equal(result.attempts,2);
 assert.equal(result.retryAllowed,false);
 assert.equal(result.verification.state,'AMBIGUOUS');
});

test('Exact-reference reconciler bounds a stalled provider attempt by timeout',async()=>{
 const adapter={verifyPayment:async()=>new Promise(()=>{})};
 const reader={getByProviderReference:()=>undefined};
 const result=await new PaystackExactReferenceReconciler(adapter,reader).reconcile('live-ref-46',1,10);
 assert.equal(result.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(result.lastProviderError,'PAYSTACK_RECONCILIATION_ATTEMPT_TIMEOUT');
 assert.equal(result.retryAllowed,false);
});

test('Exact-reference reconciler preserves unresolved outcome across provider transport failures',async()=>{
 const adapter={verifyPayment:async()=>{throw new Error('PAYSTACK_PROVIDER_REQUEST_FAILED');}};
 const reader={getByProviderReference:()=>undefined};
 const result=await new PaystackExactReferenceReconciler(adapter,reader).reconcile('live-ref-47',2,100);
 assert.equal(result.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(result.retryAllowed,false);
 assert.equal(result.lastProviderError,'PAYSTACK_PROVIDER_REQUEST_FAILED');
});

test('Exact-reference reconciler treats reference rebinding as a hard integrity failure',async()=>{
 const adapter={verifyPayment:async()=>{throw new Error('PAYSTACK_VERIFY_REFERENCE_MISMATCH');}};
 const reader={getByProviderReference:()=>undefined};
 await assert.rejects(()=>new PaystackExactReferenceReconciler(adapter,reader).reconcile('live-ref-48',2,100),/PAYSTACK_VERIFY_REFERENCE_MISMATCH/);
});
