import {randomUUID} from 'node:crypto';
import type {PgPool,PgClient} from '../../durability/src/postgres.js';
import type {PaystackLiveAuthorizationEnvelope,PaystackLiveAuthorityClaimInput} from './paystack-live-readiness.js';
import type {PaystackGovernedAuthorizationEvidence,PaystackIndependentWatchdogEvidence,PaystackWatchdogEvidenceLookup} from './paystack-live-evidence.js';

type AuthorizationRow={authorization_id:string;action:'EnablePaystackLiveBoundedTransaction';environment:'production';status:'ACTIVE'|'RESERVED'|'CLAIMED'|'REVOKED';revoked_at:string|null;reservation_id:string|null;candidate_sha:string;merchant_account_id:string;authorization_expires_at:string;live_funds_authorized:boolean;paystack_live_mode_authorized:boolean;approved_reference:string;approved_actor_id:string;approved_amount_minor:string|number;approved_currency:'GHS';authorized_by:string;authorization_basis:string;};
type WatchdogRow={watchdog_id:string;status:'ARMED'|'EXPIRED'|'DISARMED'|'FAILED';candidate_sha:string;merchant_account_id:string;expires_at:string;executor_class:'INDEPENDENT_WATCHDOG';containment_action:'DISABLE_PAYSTACK_LIVE';activating_runner_independent:boolean;evidence_source:string;};

const retryableTransactionError=(error:unknown):boolean=>{const code=typeof error==='object'&&error!==null&&'code' in error?String((error as {code?:unknown}).code??''):'';return code==='40001'||code==='40P01';};
const mapAuthorization=(row:AuthorizationRow):PaystackGovernedAuthorizationEvidence=>Object.freeze({authorizationId:row.authorization_id,action:row.action,environment:row.environment,status:row.status,revokedAt:row.revoked_at,reservationId:row.reservation_id,candidateSha:row.candidate_sha,merchantAccountId:row.merchant_account_id,authorizationExpiresAt:new Date(row.authorization_expires_at).toISOString(),liveFundsAuthorized:true,paystackLiveModeAuthorized:true,approvedTransaction:Object.freeze({reference:row.approved_reference,actorId:row.approved_actor_id,amountMinor:String(row.approved_amount_minor),currency:row.approved_currency}),authorizedBy:row.authorized_by,authorizationBasis:row.authorization_basis});
const mapWatchdog=(row:WatchdogRow):PaystackIndependentWatchdogEvidence=>Object.freeze({watchdogId:row.watchdog_id,status:row.status,candidateSha:row.candidate_sha,merchantAccountId:row.merchant_account_id,expiresAt:new Date(row.expires_at).toISOString(),executorClass:row.executor_class,containmentAction:row.containment_action,activatingRunnerIndependent:true,evidenceSource:row.evidence_source});

export class PostgresPaystackLiveGovernanceEvidenceStore {
 constructor(private readonly pool:PgPool){}
 private async tx<T>(fn:(client:PgClient)=>Promise<T>):Promise<T>{
  const maxAttempts=5;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const client=await this.pool.connect();
   try{await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const result=await fn(client);await client.query('COMMIT');return result;}
   catch(error){try{await client.query('ROLLBACK');}catch{}if(!retryableTransactionError(error)||attempt===maxAttempts) throw error;await new Promise(resolve=>setTimeout(resolve,Math.min(attempt*5,25)));}
   finally{client.release?.();}
  }
  throw new Error('PAYSTACK_LIVE_GOVERNANCE_TRANSACTION_RETRY_EXHAUSTED');
 }

 async reserveActiveAuthorization(input:PaystackLiveAuthorizationEnvelope):Promise<PaystackGovernedAuthorizationEvidence|undefined>{
  const reservationId=`reservation:${randomUUID()}`;
  return this.tx(async client=>{
   const result=await client.query<AuthorizationRow>(`UPDATE paystack_live_authorization_evidence SET status='RESERVED',reservation_id=$1,reserved_at=now(),updated_at=now() WHERE status='ACTIVE' AND revoked_at IS NULL AND authorization_expires_at>now() AND action=$2 AND environment=$3 AND candidate_sha=$4 AND merchant_account_id=$5 AND authorization_expires_at=$6::timestamptz AND live_funds_authorized=true AND paystack_live_mode_authorized=true AND approved_reference=$7 AND approved_actor_id=$8 AND approved_amount_minor=$9::numeric AND approved_currency=$10 RETURNING authorization_id,action,environment,status,revoked_at,reservation_id,candidate_sha,merchant_account_id,authorization_expires_at,live_funds_authorized,paystack_live_mode_authorized,approved_reference,approved_actor_id,approved_amount_minor,approved_currency,authorized_by,authorization_basis`,[reservationId,input.action,input.environment,input.candidateSha,input.merchantAccountId,input.authorizationExpiresAt,input.approvedTransaction.reference,input.approvedTransaction.actorId,input.approvedTransaction.amountMinor,input.approvedTransaction.currency]);
   if(result.rowCount!==1) return undefined;return mapAuthorization(result.rows[0]!);
  });
 }

 async claimReservedAuthorization(input:PaystackLiveAuthorityClaimInput):Promise<PaystackGovernedAuthorizationEvidence|undefined>{
  return this.tx(async client=>{
   const watchdog=await client.query<WatchdogRow>(`SELECT watchdog_id,status,candidate_sha,merchant_account_id,expires_at,executor_class,containment_action,activating_runner_independent,evidence_source FROM paystack_live_watchdog_evidence WHERE watchdog_id=$1 AND status='ARMED' AND expires_at>now() AND candidate_sha=$2 AND merchant_account_id=$3 AND expires_at=$4::timestamptz AND executor_class='INDEPENDENT_WATCHDOG' AND containment_action='DISABLE_PAYSTACK_LIVE' AND activating_runner_independent=true FOR SHARE`,[input.watchdogId,input.candidateSha,input.merchantAccountId,input.watchdogExpiresAt]);
   if(watchdog.rowCount!==1) return undefined;
   const result=await client.query<AuthorizationRow>(`UPDATE paystack_live_authorization_evidence SET status='CLAIMED',claimed_at=now(),updated_at=now() WHERE authorization_id=$1 AND reservation_id=$2 AND status='RESERVED' AND revoked_at IS NULL AND authorization_expires_at>now() AND candidate_sha=$3 AND merchant_account_id=$4 AND authorization_expires_at=$5::timestamptz AND approved_reference=$6 AND approved_actor_id=$7 AND approved_amount_minor=$8::numeric AND approved_currency=$9 RETURNING authorization_id,action,environment,status,revoked_at,reservation_id,candidate_sha,merchant_account_id,authorization_expires_at,live_funds_authorized,paystack_live_mode_authorized,approved_reference,approved_actor_id,approved_amount_minor,approved_currency,authorized_by,authorization_basis`,[input.authorizationId,input.reservationId,input.candidateSha,input.merchantAccountId,input.authorizationExpiresAt,input.approvedTransaction.reference,input.approvedTransaction.actorId,input.approvedTransaction.amountMinor,input.approvedTransaction.currency]);
   if(result.rowCount!==1) return undefined;return mapAuthorization(result.rows[0]!);
  });
 }

 async getWatchdogEvidence(input:PaystackWatchdogEvidenceLookup):Promise<PaystackIndependentWatchdogEvidence|undefined>{
  const client=await this.pool.connect();
  try{const result=await client.query<WatchdogRow>(`SELECT watchdog_id,status,candidate_sha,merchant_account_id,expires_at,executor_class,containment_action,activating_runner_independent,evidence_source FROM paystack_live_watchdog_evidence WHERE status='ARMED' AND expires_at>now() AND candidate_sha=$1 AND merchant_account_id=$2 AND expires_at=$3::timestamptz ORDER BY updated_at DESC LIMIT 2`,[input.candidateSha,input.merchantAccountId,input.expiresAt]);if(result.rowCount!==1) return undefined;return mapWatchdog(result.rows[0]!);}
  finally{client.release?.();}
 }
}
