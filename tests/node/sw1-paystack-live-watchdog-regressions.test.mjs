import test from 'node:test';
import assert from 'node:assert/strict';
import {PaystackLiveReadinessController} from '../../dist/packages/pilot-payments/src/paystack-live-readiness.js';
import {GovernedPaystackLiveAuthorityVerifier,GovernedPaystackIndependentWatchdogVerifier} from '../../dist/packages/pilot-payments/src/paystack-live-evidence.js';

const sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const approvedTransaction={reference:'ref:watchdog-regression',actorId:'participant:test',amountMinor:'100',currency:'GHS'};
const envelope={action:'EnablePaystackLiveBoundedTransaction',environment:'production',candidateSha:sha,runtimeSha:sha,merchantAccountId:'merchant:test',authorizationExpiresAt:'2026-09-15T14:00:00Z',liveFundsAuthorized:true,paystackLiveModeAuthorized:true,approvedTransaction,watchdog:{armed:true,independent:true,expiresAt:'2026-09-15T13:55:00Z'}};

const authorizationReader={
 async reserveActiveAuthorization(){return {authorizationId:'auth:1',action:'EnablePaystackLiveBoundedTransaction',environment:'production',status:'RESERVED',revokedAt:null,reservationId:'reservation:1',candidateSha:sha,merchantAccountId:'merchant:test',authorizationExpiresAt:'2026-09-15T14:00:00.000Z',liveFundsAuthorized:true,paystackLiveModeAuthorized:true,approvedTransaction,authorizedBy:'participant:authorizer',authorizationBasis:'regression-test'};},
 async claimReservedAuthorization(input){return {authorizationId:input.authorizationId,action:'EnablePaystackLiveBoundedTransaction',environment:'production',status:'CLAIMED',revokedAt:null,reservationId:input.reservationId,candidateSha:sha,merchantAccountId:'merchant:test',authorizationExpiresAt:'2026-09-15T14:00:00.000Z',liveFundsAuthorized:true,paystackLiveModeAuthorized:true,approvedTransaction,authorizedBy:'participant:authorizer',authorizationBasis:'regression-test'};}
};

test('equivalent RFC3339 timestamp spellings do not invalidate durable evidence',async()=>{
 const authority=new GovernedPaystackLiveAuthorityVerifier(authorizationReader);
 assert.equal((await authority.reserve(envelope)).valid,true);
 const watchdog=new GovernedPaystackIndependentWatchdogVerifier({async getWatchdogEvidence(){return {watchdogId:'watchdog:1',status:'ARMED',candidateSha:sha,merchantAccountId:'merchant:test',expiresAt:'2026-09-15T13:55:00.000Z',executorClass:'INDEPENDENT_WATCHDOG',containmentAction:'DISABLE_PAYSTACK_LIVE',activatingRunnerIndependent:true,evidenceSource:'test'};}});
 assert.deepEqual(await watchdog.verify({candidateSha:sha,merchantAccountId:'merchant:test',expiresAt:'2026-09-15T13:55:00Z'}),{valid:true,watchdogId:'watchdog:1'});
});

test('watchdog storage failure at claim boundary sticks controller OFF with containment unproven',async()=>{
 let reads=0;
 const watchdog=new GovernedPaystackIndependentWatchdogVerifier({async getWatchdogEvidence(){reads++;if(reads>1) throw new Error('database unavailable');return {watchdogId:'watchdog:1',status:'ARMED',candidateSha:sha,merchantAccountId:'merchant:test',expiresAt:'2026-09-15T13:55:00.000Z',executorClass:'INDEPENDENT_WATCHDOG',containmentAction:'DISABLE_PAYSTACK_LIVE',activatingRunnerIndependent:true,evidenceSource:'test'};}});
 const control=new PaystackLiveReadinessController(new GovernedPaystackLiveAuthorityVerifier(authorizationReader),watchdog,()=> '2026-09-15T13:00:00Z');
 await control.arm(envelope);
 await assert.rejects(control.claimBoundedTransaction({...approvedTransaction,candidateSha:sha,merchantAccountId:'merchant:test'}),/PAYSTACK_LIVE_WATCHDOG_REVALIDATION_FAILED/);
 assert.equal(control.snapshot().switchState,'OFF');
 assert.equal(control.snapshot().incidentState,'CONTAINMENT_UNPROVEN');
});
