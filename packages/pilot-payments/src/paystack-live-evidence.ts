import type {
 PaystackApprovedLiveTransaction,
 PaystackLiveAuthorityClaimInput,
 PaystackIndependentWatchdogVerifier,
 PaystackLiveAuthorizationEnvelope,
 PaystackLiveAuthorityVerifier
} from './paystack-live-readiness.js';

export type Awaitable<T>=T|Promise<T>;

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
 reserveActiveAuthorization(input:PaystackLiveAuthorizationEnvelope):Awaitable<PaystackGovernedAuthorizationEvidence|undefined>;
 claimReservedAuthorization(input:PaystackLiveAuthorityClaimInput):Awaitable<PaystackGovernedAuthorizationEvidence|undefined>;
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

export interface PaystackWatchdogEvidenceLookup {
 readonly candidateSha:string;
 readonly merchantAccountId:string;
 readonly expiresAt:string;
}

export interface PaystackIndependentWatchdogEvidenceReader {
 getWatchdogEvidence(input:PaystackWatchdogEvidenceLookup):Awaitable<PaystackIndependentWatchdogEvidence|undefined>;
}

const nonBlank=(value:string|undefined|null):value is string=>typeof value==='string'&&value.trim().length>0;
const sameInstant=(a:string,b:string)=>{
 const aMs=Date.parse(a);
 const bMs=Date.parse(b);
 return Number.isFinite(aMs)&&Number.isFinite(bMs)&&aMs===bMs;
};
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
 sameInstant(evidence.authorizationExpiresAt,input.authorizationExpiresAt)&&
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
 sameInstant(evidence.authorizationExpiresAt,input.authorizationExpiresAt)&&
 sameTransaction(evidence.approvedTransaction,input.approvedTransaction);

/**
 * The reader is responsible for atomic durable state transitions:
 * ACTIVE -> RESERVED during reserveActiveAuthorization(), and RESERVED -> CLAIMED during
 * claimReservedAuthorization(). Awaitability is deliberate: a production PostgreSQL reader
 * must complete the durable transition before authority can be accepted.
 */
export class GovernedPaystackLiveAuthorityVerifier implements PaystackLiveAuthorityVerifier {
 constructor(private readonly reader:PaystackGovernedAuthorizationEvidenceReader){}

 async reserve(input:PaystackLiveAuthorizationEnvelope):Promise<Readonly<{valid:true;authorizationId:string;reservationId:string}|{valid:false}>>{
  const evidence=await this.reader.reserveActiveAuthorization(input);
  if(!evidence) return Object.freeze({valid:false});
  if(evidence.status!=='RESERVED'||evidence.revokedAt) return Object.freeze({valid:false});
  if(!nonBlank(evidence.authorizationId)||!nonBlank(evidence.reservationId)||!nonBlank(evidence.authorizedBy)||!nonBlank(evidence.authorizationBasis)) return Object.freeze({valid:false});
  if(!evidenceMatchesEnvelope(evidence,input)) return Object.freeze({valid:false});
  return Object.freeze({valid:true,authorizationId:evidence.authorizationId,reservationId:evidence.reservationId});
 }

 async claim(input:PaystackLiveAuthorityClaimInput):Promise<Readonly<{valid:true}|{valid:false}>>{
  const evidence=await this.reader.claimReservedAuthorization(input);
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
 * before the bounded transaction claim/execution boundary. The lookup is exact and awaitable,
 * so a stale in-process cache cannot substitute for current durable watchdog evidence.
 */
export class GovernedPaystackIndependentWatchdogVerifier implements PaystackIndependentWatchdogVerifier {
 constructor(private readonly reader:PaystackIndependentWatchdogEvidenceReader){}

 async verify(input:PaystackWatchdogEvidenceLookup):Promise<Readonly<{valid:true;watchdogId:string}|{valid:false}>>{
  const evidence=await this.reader.getWatchdogEvidence(input);
  if(!evidence) return Object.freeze({valid:false});
  if(evidence.status!=='ARMED') return Object.freeze({valid:false});
  if(!nonBlank(evidence.watchdogId)||!nonBlank(evidence.evidenceSource)) return Object.freeze({valid:false});
  if(evidence.executorClass!=='INDEPENDENT_WATCHDOG'||evidence.containmentAction!=='DISABLE_PAYSTACK_LIVE'||evidence.activatingRunnerIndependent!==true) return Object.freeze({valid:false});
  if(evidence.candidateSha!==input.candidateSha||evidence.merchantAccountId!==input.merchantAccountId||!sameInstant(evidence.expiresAt,input.expiresAt)) return Object.freeze({valid:false});
  return Object.freeze({valid:true,watchdogId:evidence.watchdogId});
 }
}
