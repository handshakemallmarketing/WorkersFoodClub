import type {
 PaystackApprovedLiveTransaction,
 PaystackIndependentWatchdogVerifier,
 PaystackLiveAuthorizationEnvelope,
 PaystackLiveAuthorityVerifier
} from './paystack-live-readiness.js';

export interface PaystackGovernedAuthorizationEvidence {
 readonly authorizationId:string;
 readonly action:'EnablePaystackLiveBoundedTransaction';
 readonly environment:'production';
 readonly status:'ACTIVE'|'REVOKED';
 readonly revokedAt?:string|null;
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
 getActiveAuthorization():PaystackGovernedAuthorizationEvidence|undefined;
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

/**
 * Verifies a live-transaction authorization against durable governed evidence supplied by an
 * independent evidence reader. The envelope itself is never treated as authority.
 */
export class GovernedPaystackLiveAuthorityVerifier implements PaystackLiveAuthorityVerifier {
 constructor(private readonly reader:PaystackGovernedAuthorizationEvidenceReader){}

 verify(input:PaystackLiveAuthorizationEnvelope):Readonly<{valid:true;authorizationId:string}|{valid:false}>{
  const evidence=this.reader.getActiveAuthorization();
  if(!evidence) return Object.freeze({valid:false});
  if(evidence.status!=='ACTIVE'||evidence.revokedAt) return Object.freeze({valid:false});
  if(!nonBlank(evidence.authorizationId)||!nonBlank(evidence.authorizedBy)||!nonBlank(evidence.authorizationBasis)) return Object.freeze({valid:false});
  if(evidence.action!==input.action||evidence.environment!==input.environment) return Object.freeze({valid:false});
  if(evidence.candidateSha!==input.candidateSha||input.runtimeSha!==input.candidateSha) return Object.freeze({valid:false});
  if(evidence.merchantAccountId!==input.merchantAccountId) return Object.freeze({valid:false});
  if(evidence.authorizationExpiresAt!==input.authorizationExpiresAt) return Object.freeze({valid:false});
  if(!evidence.liveFundsAuthorized||!evidence.paystackLiveModeAuthorized) return Object.freeze({valid:false});
  if(!input.liveFundsAuthorized||!input.paystackLiveModeAuthorized) return Object.freeze({valid:false});
  if(!sameTransaction(evidence.approvedTransaction,input.approvedTransaction)) return Object.freeze({valid:false});
  return Object.freeze({valid:true,authorizationId:evidence.authorizationId});
 }
}

/**
 * Verifies that the watchdog claim is backed by independent containment evidence. Caller flags
 * such as `armed=true` or `independent=true` are insufficient without this record.
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
