import test from 'node:test';
import assert from 'node:assert/strict';
import {PaystackLiveReadinessController,PaystackExactReferenceReconciler} from '../../dist/packages/pilot-payments/src/paystack-live-readiness.js';

const sha='1995b2d3a86b9efa3bb56d77b81eb5a4693ce441';
const baseEnvelope={
 action:'EnablePaystackLiveBoundedTransaction',
 environment:'production',
 candidateSha:sha,
 runtimeSha:sha,
 merchantAccountId:'merchant:paystack:production:expected',
 authorizationExpiresAt:'2026-09-15T00:30:00Z',
 liveFundsAuthorized:true,
 paystackLiveModeAuthorized:true,
 watchdog:{armed:true,independent:true,expiresAt:'2026-09-15T00:20:00Z'}
};

test('Paystack live readiness control defaults OFF and refuses use before an exact bounded authorization is armed',()=>{
 const control=new PaystackLiveReadinessController();
 assert.deepEqual(control.snapshot(),{state:'DISABLED'});
 assert.throws(()=>control.assertBoundedTransactionAllowed({candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId,reference:'live-ref-1',now:'2026-09-14T23:00:00Z'}),/PAYSTACK_LIVE_CONTROL_DISABLED/);
});

test('Paystack live readiness control requires both live-mode and live-funds authorization',()=>{
 const control=new PaystackLiveReadinessController();
 assert.throws(()=>control.arm({...baseEnvelope,liveFundsAuthorized:false},'2026-09-14T23:00:00Z'),/PAYSTACK_LIVE_AUTHORIZATION_INCOMPLETE/);
 assert.throws(()=>control.arm({...baseEnvelope,paystackLiveModeAuthorized:false},'2026-09-14T23:00:00Z'),/PAYSTACK_LIVE_AUTHORIZATION_INCOMPLETE/);
 assert.deepEqual(control.snapshot(),{state:'DISABLED'});
});

test('Paystack live readiness control binds candidate SHA, merchant, expiry and independent watchdog',()=>{
 const control=new PaystackLiveReadinessController();
 assert.throws(()=>control.arm({...baseEnvelope,runtimeSha:'0'.repeat(40)},'2026-09-14T23:00:00Z'),/PAYSTACK_LIVE_RUNTIME_SHA_MISMATCH/);
 assert.throws(()=>control.arm({...baseEnvelope,watchdog:{...baseEnvelope.watchdog,independent:false}},'2026-09-14T23:00:00Z'),/PAYSTACK_LIVE_INDEPENDENT_WATCHDOG_REQUIRED/);
 const armed=control.arm(baseEnvelope,'2026-09-14T23:00:00Z');
 assert.equal(armed.state,'BOUNDED_WINDOW_ARMED');
 assert.throws(()=>control.assertBoundedTransactionAllowed({candidateSha:'1'.repeat(40),merchantAccountId:baseEnvelope.merchantAccountId,reference:'live-ref-1',now:'2026-09-14T23:05:00Z'}),/PAYSTACK_LIVE_CANDIDATE_REBOUND/);
 assert.throws(()=>control.assertBoundedTransactionAllowed({candidateSha:sha,merchantAccountId:'merchant:wrong',reference:'live-ref-1',now:'2026-09-14T23:05:00Z'}),/PAYSTACK_LIVE_MERCHANT_REBOUND/);
 control.assertBoundedTransactionAllowed({candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId,reference:'live-ref-1',now:'2026-09-14T23:05:00Z'});
});

test('Paystack live readiness control automatically fails closed when authorization/watchdog window expires',()=>{
 const control=new PaystackLiveReadinessController();
 control.arm(baseEnvelope,'2026-09-14T23:00:00Z');
 assert.throws(()=>control.assertBoundedTransactionAllowed({candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId,reference:'live-ref-1',now:'2026-09-15T00:20:00Z'}),/PAYSTACK_LIVE_CONTROL_WINDOW_EXPIRED/);
 assert.deepEqual(control.snapshot(),{state:'DISABLED'});
});

test('Paystack readiness state distinguishes unresolved transaction outcome from unproven containment',()=>{
 const control=new PaystackLiveReadinessController();
 assert.equal(control.markTransactionOutcomeUnresolved().state,'TRANSACTION_OUTCOME_UNRESOLVED');
 assert.throws(()=>control.assertBoundedTransactionAllowed({candidateSha:sha,merchantAccountId:baseEnvelope.merchantAccountId,reference:'live-ref-1',now:'2026-09-14T23:05:00Z'}),/PAYSTACK_LIVE_CONTROL_DISABLED/);
 assert.equal(control.markContainmentUnproven().state,'CONTAINMENT_UNPROVEN');
 assert.equal(control.disable().state,'DISABLED');
});

const verification=(reference,state)=>Object.freeze({
 provider:'PAYSTACK',providerReference:reference,rawStatus:state.toLowerCase(),state,
 amount:Object.freeze({minor:100n,currency:'GHS'}),occurredAt:'2026-09-14T23:00:00Z'
});

test('Exact-reference reconciler resolves only the original reference and never authorizes blind retry',async()=>{
 let calls=0;
 const adapter={verifyPayment:async reference=>{calls++;return calls===1?verification(reference,'PENDING'):verification(reference,'CONFIRMED');}};
 const result=await new PaystackExactReferenceReconciler(adapter).reconcile('live-ref-42',3);
 assert.equal(result.state,'RESOLVED_CONFIRMED');
 assert.equal(result.reference,'live-ref-42');
 assert.equal(result.attempts,2);
 assert.equal(result.retryAllowed,false);
});

test('Exact-reference reconciler preserves unresolved outcome after bounded pending/ambiguous observations',async()=>{
 let calls=0;
 const adapter={verifyPayment:async reference=>{calls++;return verification(reference,calls===1?'PENDING':'AMBIGUOUS');}};
 const result=await new PaystackExactReferenceReconciler(adapter).reconcile('live-ref-43',2);
 assert.equal(result.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(result.reference,'live-ref-43');
 assert.equal(result.attempts,2);
 assert.equal(result.retryAllowed,false);
 assert.equal(result.verification.state,'AMBIGUOUS');
});

test('Exact-reference reconciler preserves unresolved outcome across provider transport failures',async()=>{
 const adapter={verifyPayment:async()=>{throw new Error('PAYSTACK_PROVIDER_REQUEST_FAILED');}};
 const result=await new PaystackExactReferenceReconciler(adapter).reconcile('live-ref-44',2);
 assert.equal(result.state,'LIVE_TRANSACTION_OUTCOME_UNRESOLVED');
 assert.equal(result.retryAllowed,false);
 assert.equal(result.lastProviderError,'PAYSTACK_PROVIDER_REQUEST_FAILED');
});

test('Exact-reference reconciler treats reference rebinding as a hard integrity failure',async()=>{
 const adapter={verifyPayment:async()=>{throw new Error('PAYSTACK_VERIFY_REFERENCE_MISMATCH');}};
 await assert.rejects(()=>new PaystackExactReferenceReconciler(adapter).reconcile('live-ref-45',2),/PAYSTACK_VERIFY_REFERENCE_MISMATCH/);
});
