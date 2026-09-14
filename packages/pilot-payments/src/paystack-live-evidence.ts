import type {
 PaystackApprovedLiveTransaction,
 PaystackLiveAuthorityClaimInput,
 PaystackIndependentWatchdogVerifier,
 PaystackLiveAuthorizationEnvelope,
 PaystackLiveAuthorityVerifier
} from './paystack-live-readiness.js';

export interface PaystackGovernedAuthorizationEvidence {
 readonly authorizationId:string;
 readonly action:'EnablePaystackLiveBoundedTransaction';
 readonly environment:'production';
 readonly status:'ACTIVE'|'RESERVED'|'CLAIMED'|'REVOKED';
 readonly revokedAt?:string|null;
 readonly reservationId?:string|null;
 readonly candidateSha:string;
 readonly merchantAccountId:string;
 readonly authorizationExpiresAt:string;
 readonly liveFundsAuthorized:true;
 readonly paystackLiveModeAuthorized:true;
 readonly approvedTransaction:PaystackApprovedLiveTransaction;
 readonly authorizedBy:string;
 readonly authorizationBasis:string;
}

export interface PaystackGovernedAuthorizationEvidenceReader {
 reserveActiveAuthorization(input:PaystackLiveAuthorizationEnvelope):PaystackGovernedAuthorizationEvidence|undefined;
 claimReservedAuthorization(input:PaystackLiveAuthorityClaimInput):PaystackGovernedAuthorizationEvidence|undefined;
}

export interface PaystackIndependentWatchdogEvidence {
 readonly watchdogId:string;
 readonly status:'ARMED'|'EXPIRED'|'DISARMED'|'FAILED';
 readonly candidateSha:string;
 readonly merchantAccountId:string;
 readonly expiresAt:string;
 readonly executorClass:'INDEPENDENT_WATCHDOG';
 readonly containmentAction:'DISABLE_PAYSTACK_LIVE';
 readonly activatingRunnerIndependent:true;
 readonly evidenceSource:string;
}

export interface PaystackIndependentWatchdogEvidenceReader {
 getWatchdogEvidence():PaystackIndependentWatchdogEvidence|undefined;
}

const nonBlank=(value:string|undefined|null):value is string=>typeof value==='string'&&value.trim().length>0;
const sameTransaction=(a:PaystackApprovedLiveTransaction,b:PaystackApprovedLiveTransaction)=>
 a.reference===b.reference&&
 a.actorId===b.actorId&&
 a.amountMinor===b.amountMinor&&
 a.currency===b.currency;

const evidenceMatchesEnvelope=(evidence:PaystackGovernedAuthorizationEvidence,input:PaystackLiveAuthorizationEnvelope)=>
 evidence.action===input.action&&
 evidence.environment===input.environment&&
 evidence.candidateSha===input.candidateSha&&
 input.runtimeSha===input.candidateSha&&
 evidence.merchantAccountId===input.merchantAccountId&&
 evidence.authorizationExpiresAt===input.authorizationExpiresAt&&
 evidence.liveFundsAuthorized===true&&
 evidence.paystackLiveModeAuthorized===true&&
 input.liveFundsAuthorized===true&&
 input.paystackLiveModeAuthorized===true&&
 sameTransaction(evidence.approvedTransaction,input.approvedTransaction);

const evidenceMatchesClaim=(evidence:PaystackGovernedAuthorizationEvidence,input:PaystackLiveAuthorityClaimInput)=>
 evidence.authorizationId===input.authorizationId&&
 evidence.reservationId===input.reservationId&&
 evidence.candidateSha===input.candidateSha&&
 input.runtimeSha===input.candidateSha&&
 evidence.merchantAccountId===input.merchantAccountId&&
 evidence.authorizationExpiresAt===input.authorizationExpiresAt&&
 sameTransaction(evidence.approvedTransaction,input.approvedTransaction);

/**
 * The reader is responsible for atomic durable state transitions:
 * ACTIVE -> RESERVED during reserveActiveAuthorization(), and RESERVED -> CLAIMED during
 * claimReservedAuthorization(). This prevents concurrent controllers or process restarts from
 * reusing one governed authorization for more than one live transaction.
 */
export class GovernedPaystackLiveAuthorityVerifier implements PaystackLiveAuthorityVerifier {
 constructor(private readonly reader:PaystackGovernedAuthorizationEvidenceReader){}

 reserve(input:PaystackLiveAuthorizationEnvelope):Readonly<{valid:true;authorizationId:string;reservationId:string}|{valid:false}>{
  const evidence=this.reader.reserveActiveAuthorization(input);
  if(!evidence) return Object.freeze({valid:false});
  if(evidence.status!=='RESERVED'||evidence.revokedAt) return Object.freeze({valid:false});
  if(!nonBlank(evidence.authorizationId)||!nonBlank(evidence.reservationId)||!nonBlank(evidence.authorizedBy)||!nonBlank(evidence.authorizationBasis)) return Object.freeze({valid:false});
  if(!evidenceMatchesEnvelope(evidence,input)) return Object.freeze({valid:false});
  return Object.freeze({valid:true,authorizationId:evidence.authorizationId,reservationId:evidence.reservationId});
 }

 claim(input:PaystackLiveAuthorityClaimInput):Readonly<{valid:true}|{valid:false}>{
  const evidence=this.reader.claimReservedAuthorization(input);
  if(!evidence) return Object.freeze({valid:false});
  if(evidence.status!=='CLAIMED'||evidence.revokedAt) return Object.freeze({valid:false});
  if(!nonBlank(evidence.authorizationId)||!nonBlank(evidence.reservationId)||!nonBlank(evidence.authorizedBy)||!nonBlank(evidence.authorizationBasis)) return Object.freeze({valid:false});
  if(!evidenceMatchesClaim(evidence,input)) return Object.freeze({valid:false});
  return Object.freeze({valid:true});
 }
}

/**
 * Verifies that the watchdog claim is backed by current independent containment evidence.
 * The controller invokes this both before durable authorization reservation and immediately
 * before the bounded transaction claim/execution boundary.
 */
export class GovernedPaystackIndependentWatchdogVerifier implements PaystackIndependentWatchdogVerifier {
 constructor(private readonly reader:PaystackIndependentWatchdogEvidenceReader){}

 verify(input:Readonly<{candidateSha:string;merchantAccountId:string;expiresAt:string}>):Readonly<{valid:true;watchdogId:string}|{valid:false}>{
  const evidence=this.reader.getWatchdogEvidence();
  if(!evidence) return Object.freeze({valid:false});
  if(evidence.status!=='ARMED') return Object.freeze({valid:false});
  if(!nonBlank(evidence.watchdogId)||!nonBlank(evidence.evidenceSource)) return Object.freeze({valid:false});
  if(evidence.executorClass!=='INDEPENDENT_WATCHDOG'||evidence.containmentAction!=='DISABLE_PAYSTACK_LIVE'||evidence.activatingRunnerIndependent!==true) return Object.freeze({valid:false});
  if(evidence.candidateSha!==input.candidateSha||evidence.merchantAccountId!==input.merchantAccountId||evidence.expiresAt!==input.expiresAt) return Object.freeze({valid:false});
  return Object.freeze({valid:true,watchdogId:evidence.watchdogId});
 }
}
