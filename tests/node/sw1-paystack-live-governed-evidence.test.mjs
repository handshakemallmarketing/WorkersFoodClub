import test from 'node:test';
import assert from 'node:assert/strict';
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

const authorityReader=evidence=>({getActiveAuthorization:()=>evidence});
const watchdogReader=evidence=>({getWatchdogEvidence:()=>evidence});

test('governed authority verifier accepts only exact durable authorization evidence',()=>{
 const verifier=new GovernedPaystackLiveAuthorityVerifier(authorityReader(authorizationEvidence));
 assert.deepEqual(verifier.verify(envelope),{valid:true,authorizationId:'authz:paystack-live:bounded:001'});
});

test('governed authority verifier rejects missing, revoked, rebound, or incomplete evidence',()=>{
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(authorityReader(undefined)).verify(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(authorityReader({...authorizationEvidence,status:'REVOKED',revokedAt:'2026-09-14T23:10:00Z'})).verify(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(authorityReader({...authorizationEvidence,candidateSha:'0'.repeat(40)})).verify(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(authorityReader({...authorizationEvidence,merchantAccountId:'merchant:other'})).verify(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(authorityReader({...authorizationEvidence,authorizationExpiresAt:'2026-09-15T01:01:00Z'})).verify(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(authorityReader({...authorizationEvidence,approvedTransaction:{...approvedTransaction,amountMinor:'101'}})).verify(envelope),{valid:false});
 assert.deepEqual(new GovernedPaystackLiveAuthorityVerifier(authorityReader({...authorizationEvidence,authorizedBy:''})).verify(envelope),{valid:false});
});

test('governed authority verifier rejects caller envelope substitution even with valid evidence',()=>{
 const verifier=new GovernedPaystackLiveAuthorityVerifier(authorityReader(authorizationEvidence));
 assert.deepEqual(verifier.verify({...envelope,runtimeSha:'1'.repeat(40)}),{valid:false});
 assert.deepEqual(verifier.verify({...envelope,approvedTransaction:{...approvedTransaction,reference:'replacement-ref'}}),{valid:false});
 assert.deepEqual(verifier.verify({...envelope,liveFundsAuthorized:false}),{valid:false});
});

test('independent watchdog verifier accepts exact independently enforced containment evidence',()=>{
 const verifier=new GovernedPaystackIndependentWatchdogVerifier(watchdogReader(watchdogEvidence));
 assert.deepEqual(verifier.verify({candidateSha:sha,merchantAccountId:envelope.merchantAccountId,expiresAt:envelope.watchdog.expiresAt}),{valid:true,watchdogId:'watchdog:paystack-live:001'});
});

test('independent watchdog verifier rejects missing, inactive, non-independent, rebound, or malformed evidence',()=>{
 const input={candidateSha:sha,merchantAccountId:envelope.merchantAccountId,expiresAt:envelope.watchdog.expiresAt};
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(watchdogReader(undefined)).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(watchdogReader({...watchdogEvidence,status:'EXPIRED'})).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(watchdogReader({...watchdogEvidence,activatingRunnerIndependent:false})).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(watchdogReader({...watchdogEvidence,candidateSha:'f'.repeat(40)})).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(watchdogReader({...watchdogEvidence,merchantAccountId:'merchant:wrong'})).verify(input),{valid:false});
 assert.deepEqual(new GovernedPaystackIndependentWatchdogVerifier(watchdogReader({...watchdogEvidence,evidenceSource:''})).verify(input),{valid:false});
});
