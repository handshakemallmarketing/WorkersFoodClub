import type {Money} from '../../kernel/src/index.js';
import type {PaystackPaymentAdapter,PaystackVerification} from './paystack.js';

export type PaystackLiveSwitchState='OFF'|'ARMED'|'TRANSACTION_CLAIMED';
export type PaystackLiveIncidentState='NONE'|'TRANSACTION_OUTCOME_UNRESOLVED'|'CONTAINMENT_UNPROVEN';
export type PaystackReconciliationState='RESOLVED_CONFIRMED'|'RESOLVED_FAILED'|'RESOLVED_REVERSED'|'LIVE_TRANSACTION_OUTCOME_UNRESOLVED';

export interface PaystackApprovedLiveTransaction {
 readonly reference:string;
 readonly actorId:string;
 readonly amountMinor:string;
 readonly currency:'GHS';
}

export interface PaystackLiveAuthorizationEnvelope {
 readonly action:'EnablePaystackLiveBoundedTransaction';
 readonly environment:'production';
 readonly candidateSha:string;
 readonly runtimeSha:string;
 readonly merchantAccountId:string;
 readonly authorizationExpiresAt:string;
 readonly liveFundsAuthorized:boolean;
 readonly paystackLiveModeAuthorized:boolean;
 readonly approvedTransaction:PaystackApprovedLiveTransaction;
 readonly watchdog:Readonly<{
  armed:boolean;
  independent:boolean;
  expiresAt:string;
 }>;
}

export interface PaystackLiveAuthorityClaimInput {
 readonly authorizationId:string;
 readonly reservationId:string;
 readonly candidateSha:string;
 readonly runtimeSha:string;
 readonly merchantAccountId:string;
 readonly authorizationExpiresAt:string;
 readonly approvedTransaction:PaystackApprovedLiveTransaction;
}

export interface PaystackLiveAuthorityVerifier {
 reserve(input:PaystackLiveAuthorizationEnvelope):Promise<Readonly<{valid:true;authorizationId:string;reservationId:string}|{valid:false}>>;
 claim(input:PaystackLiveAuthorityClaimInput):Promise<Readonly<{valid:true}|{valid:false}>>;
}

export interface PaystackIndependentWatchdogVerifier {
 verify(input:Readonly<{candidateSha:string;merchantAccountId:string;expiresAt:string}>):Promise<Readonly<{valid:true;watchdogId:string}|{valid:false}>>;
}

export interface PaystackLiveControlSnapshot {
 readonly switchState:PaystackLiveSwitchState;
 readonly incidentState:PaystackLiveIncidentState;
 readonly candidateSha?:string;
 readonly merchantAccountId?:string;
 readonly authorizationExpiresAt?:string;
 readonly watchdogExpiresAt?:string;
 readonly authorizationId?:string;
 readonly authorizationReservationId?:string;
 readonly watchdogId?:string;
 readonly approvedTransaction?:PaystackApprovedLiveTransaction;
}

export interface PaystackCanonicalPaymentEvidence {
 readonly providerReference:string;
 readonly status:'CONFIRMED'|'FAILED'|'REVERSED';
 readonly amount:Money;
}

export interface PaystackCanonicalEvidenceReader {
 getByProviderReference(reference:string):PaystackCanonicalPaymentEvidence|undefined|Promise<PaystackCanonicalPaymentEvidence|undefined>;
}

export interface PaystackReconciliationResult {
 readonly state:PaystackReconciliationState;
 readonly reference:string;
 readonly attempts:number;
 readonly retryAllowed:false;
 readonly verification?:PaystackVerification;
 readonly lastProviderError?:string;
 readonly lastCanonicalIssue?:string;
}

const nonBlank=(value:string)=>typeof value==='string'&&value.trim().length>0;
const validSha=(value:string)=>/^[a-f0-9]{40}$/i.test(value);
const parseTime=(value:string,error:string)=>{
 const parsed=Date.parse(value);
 if(!nonBlank(value)||Number.isNaN(parsed)) throw new Error(error);
 return parsed;
};
const parseMinor=(value:string)=>{
 if(!/^\d+$/.test(value)) throw new Error('PAYSTACK_LIVE_APPROVED_AMOUNT_INVALID');
 const parsed=BigInt(value);
 if(parsed<=0n) throw new Error('PAYSTACK_LIVE_APPROVED_AMOUNT_INVALID');
 return parsed;
};
const sameMoney=(a:Money,b:Money)=>a.currency===b.currency&&a.minor===b.minor;

/**
 * Readiness control. It does not configure Paystack, read credentials, or move funds.
 * Durable authority is atomically reserved before arming, then atomically consumed at claim.
 * Authority and independent watchdog evidence are revalidated at the claim/execution boundary.
 * The evidence boundary is asynchronous so production PostgreSQL state is actually committed/read
 * before the controller advances its in-process state.
 */
export class PaystackLiveReadinessController {
 private snapshotValue:PaystackLiveControlSnapshot=Object.freeze({switchState:'OFF',incidentState:'NONE'});
 constructor(
  private readonly authorityVerifier:PaystackLiveAuthorityVerifier,
  private readonly watchdogVerifier:PaystackIndependentWatchdogVerifier,
  private readonly clock:()=>string
 ){}

 private refreshExpiry():void{
  const current=this.snapshotValue;
  if(current.switchState==='OFF') return;
  const nowMs=parseTime(this.clock(),'PAYSTACK_LIVE_CONTROL_TIME_INVALID');
  const authExpiry=parseTime(current.authorizationExpiresAt??'','PAYSTACK_LIVE_AUTHORIZATION_EXPIRY_INVALID');
  const watchdogExpiry=parseTime(current.watchdogExpiresAt??'','PAYSTACK_LIVE_WATCHDOG_EXPIRY_INVALID');
  if(nowMs>=authExpiry||nowMs>=watchdogExpiry){
   this.snapshotValue=Object.freeze({...current,switchState:'OFF'});
  }
 }

 snapshot():PaystackLiveControlSnapshot{
  this.refreshExpiry();
  return this.snapshotValue;
 }

 async arm(input:PaystackLiveAuthorizationEnvelope):Promise<PaystackLiveControlSnapshot>{
  this.refreshExpiry();
  const nowMs=parseTime(this.clock(),'PAYSTACK_LIVE_CONTROL_TIME_INVALID');
  if(this.snapshotValue.incidentState!=='NONE') throw new Error('PAYSTACK_LIVE_INCIDENT_UNRESOLVED');
  if(this.snapshotValue.switchState!=='OFF') throw new Error('PAYSTACK_LIVE_CONTROL_ALREADY_ARMED');
  if(input.action!=='EnablePaystackLiveBoundedTransaction') throw new Error('PAYSTACK_LIVE_ACTION_NOT_AUTHORIZED');
  if(input.environment!=='production') throw new Error('PAYSTACK_LIVE_ENVIRONMENT_INVALID');
  if(!input.liveFundsAuthorized||!input.paystackLiveModeAuthorized) throw new Error('PAYSTACK_LIVE_AUTHORIZATION_INCOMPLETE');
  if(!validSha(input.candidateSha)||input.runtimeSha!==input.candidateSha) throw new Error('PAYSTACK_LIVE_RUNTIME_SHA_MISMATCH');
  if(!nonBlank(input.merchantAccountId)) throw new Error('PAYSTACK_LIVE_MERCHANT_BINDING_REQUIRED');
  if(!nonBlank(input.approvedTransaction.reference)||!nonBlank(input.approvedTransaction.actorId)) throw new Error('PAYSTACK_LIVE_TRANSACTION_BINDING_REQUIRED');
  parseMinor(input.approvedTransaction.amountMinor);
  const authorizationExpiry=parseTime(input.authorizationExpiresAt,'PAYSTACK_LIVE_AUTHORIZATION_EXPIRY_INVALID');
  const watchdogExpiry=parseTime(input.watchdog.expiresAt,'PAYSTACK_LIVE_WATCHDOG_EXPIRY_INVALID');
  if(authorizationExpiry<=nowMs) throw new Error('PAYSTACK_LIVE_AUTHORIZATION_EXPIRED');
  if(!input.watchdog.armed||!input.watchdog.independent) throw new Error('PAYSTACK_LIVE_INDEPENDENT_WATCHDOG_REQUIRED');
  if(watchdogExpiry<=nowMs||watchdogExpiry>authorizationExpiry) throw new Error('PAYSTACK_LIVE_WATCHDOG_WINDOW_INVALID');

  const watchdog=await this.watchdogVerifier.verify({candidateSha:input.candidateSha,merchantAccountId:input.merchantAccountId,expiresAt:input.watchdog.expiresAt});
  if(!watchdog.valid||!nonBlank(watchdog.watchdogId)) throw new Error('PAYSTACK_LIVE_WATCHDOG_EVIDENCE_INVALID');

  const authority=await this.authorityVerifier.reserve(input);
  if(!authority.valid||!nonBlank(authority.authorizationId)||!nonBlank(authority.reservationId)) throw new Error('PAYSTACK_LIVE_AUTHORIZATION_EVIDENCE_INVALID');

  this.snapshotValue=Object.freeze({
   switchState:'ARMED',
   incidentState:'NONE',
   candidateSha:input.candidateSha,
   merchantAccountId:input.merchantAccountId,
   authorizationExpiresAt:input.authorizationExpiresAt,
   watchdogExpiresAt:input.watchdog.expiresAt,
   authorizationId:authority.authorizationId,
   authorizationReservationId:authority.reservationId,
   watchdogId:watchdog.watchdogId,
   approvedTransaction:Object.freeze({...input.approvedTransaction})
  });
  return this.snapshotValue;
 }

 async claimBoundedTransaction(input:{candidateSha:string;merchantAccountId:string;reference:string;actorId:string;amountMinor:string;currency:'GHS'}):Promise<PaystackLiveControlSnapshot>{
  this.refreshExpiry();
  const current=this.snapshotValue;
  if(current.incidentState!=='NONE') throw new Error('PAYSTACK_LIVE_INCIDENT_UNRESOLVED');
  if(current.switchState!=='ARMED') throw new Error(current.switchState==='TRANSACTION_CLAIMED'?'PAYSTACK_LIVE_TRANSACTION_ALREADY_CLAIMED':'PAYSTACK_LIVE_CONTROL_DISABLED');
  if(current.candidateSha!==input.candidateSha) throw new Error('PAYSTACK_LIVE_CANDIDATE_REBOUND');
  if(current.merchantAccountId!==input.merchantAccountId) throw new Error('PAYSTACK_LIVE_MERCHANT_REBOUND');
  const approved=current.approvedTransaction;
  if(!approved) throw new Error('PAYSTACK_LIVE_TRANSACTION_BINDING_REQUIRED');
  if(approved.reference!==input.reference||approved.actorId!==input.actorId||approved.amountMinor!==input.amountMinor||approved.currency!==input.currency) throw new Error('PAYSTACK_LIVE_TRANSACTION_REBOUND');
  parseMinor(input.amountMinor);

  const watchdog=await this.watchdogVerifier.verify({
   candidateSha:current.candidateSha??'',
   merchantAccountId:current.merchantAccountId??'',
   expiresAt:current.watchdogExpiresAt??''
  });
  if(!watchdog.valid||watchdog.watchdogId!==current.watchdogId){
   this.snapshotValue=Object.freeze({...current,switchState:'OFF',incidentState:'CONTAINMENT_UNPROVEN'});
   throw new Error('PAYSTACK_LIVE_WATCHDOG_REVALIDATION_FAILED');
  }

  const authorizationId=current.authorizationId;
  const reservationId=current.authorizationReservationId;
  if(!authorizationId||!reservationId){
   this.snapshotValue=Object.freeze({...current,switchState:'OFF'});
   throw new Error('PAYSTACK_LIVE_AUTHORIZATION_RESERVATION_MISSING');
  }
  const claimed=await this.authorityVerifier.claim({
   authorizationId,
   reservationId,
   candidateSha:current.candidateSha??'',
   runtimeSha:current.candidateSha??'',
   merchantAccountId:current.merchantAccountId??'',
   authorizationExpiresAt:current.authorizationExpiresAt??'',
   approvedTransaction:approved
  });
  if(!claimed.valid){
   this.snapshotValue=Object.freeze({...current,switchState:'OFF'});
   throw new Error('PAYSTACK_LIVE_AUTHORIZATION_REVALIDATION_FAILED');
  }

  this.snapshotValue=Object.freeze({...current,switchState:'TRANSACTION_CLAIMED'});
  return this.snapshotValue;
 }

 markTransactionOutcomeUnresolved():PaystackLiveControlSnapshot{
  const current=this.snapshot();
  if(current.incidentState!=='CONTAINMENT_UNPROVEN') this.snapshotValue=Object.freeze({...current,incidentState:'TRANSACTION_OUTCOME_UNRESOLVED'});
  return this.snapshotValue;
 }

 markContainmentUnproven():PaystackLiveControlSnapshot{
  const current=this.snapshot();
  this.snapshotValue=Object.freeze({...current,incidentState:'CONTAINMENT_UNPROVEN'});
  return this.snapshotValue;
 }

 disable():PaystackLiveControlSnapshot{
  const current=this.snapshot();
  this.snapshotValue=Object.freeze({...current,switchState:'OFF'});
  return this.snapshotValue;
 }
}

const withTimeout=async<T>(promise:Promise<T>,timeoutMs:number):Promise<T>=>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   promise,
   new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('PAYSTACK_RECONCILIATION_ATTEMPT_TIMEOUT')),timeoutMs);})
  ]);
 }finally{
  if(timer!==undefined) clearTimeout(timer);
 }
};

const canonicalIssue=(reference:string,verification:PaystackVerification,canonical:PaystackCanonicalPaymentEvidence|undefined):string|undefined=>{
 if(!canonical) return 'CANONICAL_PAYMENT_EVIDENCE_MISSING';
 if(canonical.providerReference!==reference) return 'CANONICAL_PROVIDER_REFERENCE_MISMATCH';
 if(!sameMoney(canonical.amount,verification.amount)) return 'CANONICAL_PAYMENT_AMOUNT_MISMATCH';
 if(canonical.status!==verification.state) return 'CANONICAL_PAYMENT_STATUS_MISMATCH';
 return undefined;
};

/**
 * Bounded exact-reference reconciliation for ambiguous provider outcomes.
 * Terminal provider evidence resolves the incident only when canonical application evidence
 * agrees on reference, amount and terminal state. Blind replacement charges remain forbidden.
 */
export class PaystackExactReferenceReconciler {
 constructor(
  private readonly adapter:Pick<PaystackPaymentAdapter,'verifyPayment'>,
  private readonly canonicalReader:PaystackCanonicalEvidenceReader
 ){}

 async reconcile(reference:string,maxAttempts=3,attemptTimeoutMs=5_000):Promise<PaystackReconciliationResult>{
  if(!nonBlank(reference)) throw new Error('PAYSTACK_REFERENCE_REQUIRED');
  if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>10) throw new Error('PAYSTACK_RECONCILIATION_ATTEMPTS_INVALID');
  if(!Number.isSafeInteger(attemptTimeoutMs)||attemptTimeoutMs<1||attemptTimeoutMs>60_000) throw new Error('PAYSTACK_RECONCILIATION_TIMEOUT_INVALID');
  let lastVerification:PaystackVerification|undefined;
  let lastProviderError:string|undefined;
  let lastCanonicalIssue:string|undefined;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   try{
    const verification=await withTimeout(this.adapter.verifyPayment(reference),attemptTimeoutMs);
    lastVerification=verification;
    if(verification.providerReference!==reference) throw new Error('PAYSTACK_VERIFY_REFERENCE_MISMATCH');
    if(verification.state==='CONFIRMED'||verification.state==='FAILED'||verification.state==='REVERSED'){
     let canonical:PaystackCanonicalPaymentEvidence|undefined;
     try{canonical=await withTimeout(Promise.resolve(this.canonicalReader.getByProviderReference(reference)),attemptTimeoutMs);}
     catch(error){lastCanonicalIssue=error instanceof Error?error.message:'CANONICAL_PAYMENT_EVIDENCE_READ_FAILED';continue;}
     const issue=canonicalIssue(reference,verification,canonical);
     if(issue){lastCanonicalIssue=issue;continue;}
     const state=verification.state==='CONFIRMED'?'RESOLVED_CONFIRMED':verification.state==='FAILED'?'RESOLVED_FAILED':'RESOLVED_REVERSED';
     return Object.freeze({state,reference,attempts:attempt,retryAllowed:false,verification});
    }
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
   ...(lastProviderError?{lastProviderError}:{}),
   ...(lastCanonicalIssue?{lastCanonicalIssue}:{})
  });
 }
}
