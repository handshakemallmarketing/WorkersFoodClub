import type {PaystackPaymentAdapter,PaystackVerification} from './paystack.js';

export type PaystackLiveControlState='DISABLED'|'BOUNDED_WINDOW_ARMED'|'TRANSACTION_OUTCOME_UNRESOLVED'|'CONTAINMENT_UNPROVEN';
export type PaystackReconciliationState='RESOLVED_CONFIRMED'|'RESOLVED_FAILED'|'RESOLVED_REVERSED'|'LIVE_TRANSACTION_OUTCOME_UNRESOLVED';

export interface PaystackLiveAuthorizationEnvelope {
 readonly action:'EnablePaystackLiveBoundedTransaction';
 readonly environment:'production';
 readonly candidateSha:string;
 readonly runtimeSha:string;
 readonly merchantAccountId:string;
 readonly authorizationExpiresAt:string;
 readonly liveFundsAuthorized:boolean;
 readonly paystackLiveModeAuthorized:boolean;
 readonly watchdog:Readonly<{
  armed:boolean;
  independent:boolean;
  expiresAt:string;
 }>;
}

export interface PaystackLiveAuthorityVerifier {
 verify(input:PaystackLiveAuthorizationEnvelope):Readonly<{valid:true;authorizationId:string}|{valid:false}>;
}

export interface PaystackIndependentWatchdogVerifier {
 verify(input:Readonly<{candidateSha:string;merchantAccountId:string;expiresAt:string}>):Readonly<{valid:true;watchdogId:string}|{valid:false}>;
}

export interface PaystackLiveControlSnapshot {
 readonly state:PaystackLiveControlState;
 readonly candidateSha?:string;
 readonly merchantAccountId?:string;
 readonly authorizationExpiresAt?:string;
 readonly watchdogExpiresAt?:string;
 readonly authorizationId?:string;
 readonly watchdogId?:string;
}

export interface PaystackReconciliationResult {
 readonly state:PaystackReconciliationState;
 readonly reference:string;
 readonly attempts:number;
 readonly retryAllowed:false;
 readonly verification?:PaystackVerification;
 readonly lastProviderError?:string;
}

const nonBlank=(value:string)=>typeof value==='string'&&value.trim().length>0;
const validSha=(value:string)=>/^[a-f0-9]{40}$/i.test(value);
const parseTime=(value:string,error:string)=>{
 const parsed=Date.parse(value);
 if(!nonBlank(value)||Number.isNaN(parsed)) throw new Error(error);
 return parsed;
};

/**
 * Pure readiness control. It does not configure Paystack, read credentials, or move funds.
 * Authorization and watchdog state must be verified by independent evidence providers rather
 * than accepted as caller assertions. A future runtime integration must still separately wire
 * the provider adapter behind this control.
 */
export class PaystackLiveReadinessController {
 private snapshotValue:PaystackLiveControlSnapshot=Object.freeze({state:'DISABLED'});
 constructor(
  private readonly authorityVerifier:PaystackLiveAuthorityVerifier,
  private readonly watchdogVerifier:PaystackIndependentWatchdogVerifier
 ){}

 snapshot():PaystackLiveControlSnapshot{return this.snapshotValue;}

 arm(input:PaystackLiveAuthorizationEnvelope,now:string):PaystackLiveControlSnapshot{
  const nowMs=parseTime(now,'PAYSTACK_LIVE_CONTROL_TIME_INVALID');
  if(input.action!=='EnablePaystackLiveBoundedTransaction') throw new Error('PAYSTACK_LIVE_ACTION_NOT_AUTHORIZED');
  if(input.environment!=='production') throw new Error('PAYSTACK_LIVE_ENVIRONMENT_INVALID');
  if(!input.liveFundsAuthorized||!input.paystackLiveModeAuthorized) throw new Error('PAYSTACK_LIVE_AUTHORIZATION_INCOMPLETE');
  if(!validSha(input.candidateSha)||input.runtimeSha!==input.candidateSha) throw new Error('PAYSTACK_LIVE_RUNTIME_SHA_MISMATCH');
  if(!nonBlank(input.merchantAccountId)) throw new Error('PAYSTACK_LIVE_MERCHANT_BINDING_REQUIRED');
  const authorizationExpiry=parseTime(input.authorizationExpiresAt,'PAYSTACK_LIVE_AUTHORIZATION_EXPIRY_INVALID');
  const watchdogExpiry=parseTime(input.watchdog.expiresAt,'PAYSTACK_LIVE_WATCHDOG_EXPIRY_INVALID');
  if(authorizationExpiry<=nowMs) throw new Error('PAYSTACK_LIVE_AUTHORIZATION_EXPIRED');
  if(!input.watchdog.armed||!input.watchdog.independent) throw new Error('PAYSTACK_LIVE_INDEPENDENT_WATCHDOG_REQUIRED');
  if(watchdogExpiry<=nowMs||watchdogExpiry>authorizationExpiry) throw new Error('PAYSTACK_LIVE_WATCHDOG_WINDOW_INVALID');
  const authority=this.authorityVerifier.verify(input);
  if(!authority.valid||!nonBlank(authority.authorizationId)) throw new Error('PAYSTACK_LIVE_AUTHORIZATION_EVIDENCE_INVALID');
  const watchdog=this.watchdogVerifier.verify({candidateSha:input.candidateSha,merchantAccountId:input.merchantAccountId,expiresAt:input.watchdog.expiresAt});
  if(!watchdog.valid||!nonBlank(watchdog.watchdogId)) throw new Error('PAYSTACK_LIVE_WATCHDOG_EVIDENCE_INVALID');
  this.snapshotValue=Object.freeze({
   state:'BOUNDED_WINDOW_ARMED',
   candidateSha:input.candidateSha,
   merchantAccountId:input.merchantAccountId,
   authorizationExpiresAt:input.authorizationExpiresAt,
   watchdogExpiresAt:input.watchdog.expiresAt,
   authorizationId:authority.authorizationId,
   watchdogId:watchdog.watchdogId
  });
  return this.snapshotValue;
 }

 assertBoundedTransactionAllowed(input:{candidateSha:string;merchantAccountId:string;reference:string;now:string}):void{
  const nowMs=parseTime(input.now,'PAYSTACK_LIVE_CONTROL_TIME_INVALID');
  const current=this.snapshotValue;
  if(current.state!=='BOUNDED_WINDOW_ARMED') throw new Error('PAYSTACK_LIVE_CONTROL_DISABLED');
  if(current.candidateSha!==input.candidateSha) throw new Error('PAYSTACK_LIVE_CANDIDATE_REBOUND');
  if(current.merchantAccountId!==input.merchantAccountId) throw new Error('PAYSTACK_LIVE_MERCHANT_REBOUND');
  if(!nonBlank(input.reference)) throw new Error('PAYSTACK_LIVE_REFERENCE_REQUIRED');
  const authExpiry=parseTime(current.authorizationExpiresAt??'','PAYSTACK_LIVE_AUTHORIZATION_EXPIRY_INVALID');
  const watchdogExpiry=parseTime(current.watchdogExpiresAt??'','PAYSTACK_LIVE_WATCHDOG_EXPIRY_INVALID');
  if(nowMs>=authExpiry||nowMs>=watchdogExpiry){
   this.snapshotValue=Object.freeze({state:'DISABLED'});
   throw new Error('PAYSTACK_LIVE_CONTROL_WINDOW_EXPIRED');
  }
 }

 markTransactionOutcomeUnresolved():PaystackLiveControlSnapshot{
  this.snapshotValue=Object.freeze({state:'TRANSACTION_OUTCOME_UNRESOLVED'});
  return this.snapshotValue;
 }

 markContainmentUnproven():PaystackLiveControlSnapshot{
  this.snapshotValue=Object.freeze({state:'CONTAINMENT_UNPROVEN'});
  return this.snapshotValue;
 }

 disable():PaystackLiveControlSnapshot{
  this.snapshotValue=Object.freeze({state:'DISABLED'});
  return this.snapshotValue;
 }
}

/**
 * Bounded exact-reference reconciliation for ambiguous provider outcomes.
 * The result always forbids blind retry. A caller must resolve the exact reference first.
 */
export class PaystackExactReferenceReconciler {
 constructor(private readonly adapter:Pick<PaystackPaymentAdapter,'verifyPayment'>){}

 async reconcile(reference:string,maxAttempts=3):Promise<PaystackReconciliationResult>{
  if(!nonBlank(reference)) throw new Error('PAYSTACK_REFERENCE_REQUIRED');
  if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>10) throw new Error('PAYSTACK_RECONCILIATION_ATTEMPTS_INVALID');
  let lastVerification:PaystackVerification|undefined;
  let lastProviderError:string|undefined;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   try{
    const verification=await this.adapter.verifyPayment(reference);
    lastVerification=verification;
    if(verification.providerReference!==reference) throw new Error('PAYSTACK_VERIFY_REFERENCE_MISMATCH');
    if(verification.state==='CONFIRMED') return Object.freeze({state:'RESOLVED_CONFIRMED',reference,attempts:attempt,retryAllowed:false,verification});
    if(verification.state==='FAILED') return Object.freeze({state:'RESOLVED_FAILED',reference,attempts:attempt,retryAllowed:false,verification});
    if(verification.state==='REVERSED') return Object.freeze({state:'RESOLVED_REVERSED',reference,attempts:attempt,retryAllowed:false,verification});
   }catch(error){
    const message=error instanceof Error?error.message:'PAYSTACK_PROVIDER_REQUEST_FAILED';
    if(message==='PAYSTACK_VERIFY_REFERENCE_MISMATCH') throw error;
    lastProviderError=message;
   }
  }
  return Object.freeze({
   state:'LIVE_TRANSACTION_OUTCOME_UNRESOLVED',
   reference,
   attempts:maxAttempts,
   retryAllowed:false,
   ...(lastVerification?{verification:lastVerification}:{}),
   ...(lastProviderError?{lastProviderError}:{})
  });
 }
}
