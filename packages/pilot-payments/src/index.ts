import type {EvidenceId,Money,ObligationId,OfferId,ParticipantId} from '../../kernel/src/index.js';
import {asId} from '../../kernel/src/index.js';
import type {MemberOffer} from '../../catalog/src/index.js';
import {InMemoryDemandCommitmentLedger,type PaymentEvidenceRecord} from '../../demand/src/index.js';

export type ProviderTerminalStatus='CONFIRMED'|'FAILED';
export interface PaymentIntent {readonly id:string;readonly obligationId:ObligationId;readonly participantId:ParticipantId;readonly offerId:OfferId;readonly provider:string;readonly providerReference:string;readonly amount:Money;readonly state:'PENDING';readonly createdAt:string;}
export interface VerifiedProviderWebhook {readonly providerReference:string;readonly status:ProviderTerminalStatus;readonly amount:Money;readonly occurredAt:string;}
export interface PaymentWebhookVerifier {verify(input:{rawBody:string;signature:string}):VerifiedProviderWebhook;}
export interface PaymentProvider {readonly name:string;createIntent(input:{obligationId:ObligationId;participantId:ParticipantId;offerId:OfferId;amount:Money;idempotencyKey:string;at:string}):PaymentIntent;getIntent(providerReference:string):PaymentIntent|undefined;}

const validTime=(v:string)=>{if(Number.isNaN(Date.parse(v))) throw new Error('PAYMENT_TIME_INVALID');};
const sameMoney=(a:Money,b:Money)=>a.currency===b.currency&&a.minor===b.minor;

export class SandboxPaymentProvider implements PaymentProvider{
 readonly name='SANDBOX_MOMO';private seq=0;private byRef=new Map<string,PaymentIntent>();private byKey=new Map<string,PaymentIntent>();
 createIntent(input:{obligationId:ObligationId;participantId:ParticipantId;offerId:OfferId;amount:Money;idempotencyKey:string;at:string}):PaymentIntent{
  validTime(input.at);if(!input.idempotencyKey.trim()) throw new Error('PAYMENT_IDEMPOTENCY_KEY_REQUIRED');const prior=this.byKey.get(input.idempotencyKey);if(prior){if(prior.obligationId!==input.obligationId||prior.participantId!==input.participantId||prior.offerId!==input.offerId||!sameMoney(prior.amount,input.amount)) throw new Error('PAYMENT_IDEMPOTENCY_CONFLICT');return prior;}
  const ref=`sandbox-ref-${++this.seq}`;const intent:Object=Object.freeze({id:`payment-intent-${this.seq}`,obligationId:input.obligationId,participantId:input.participantId,offerId:input.offerId,provider:this.name,providerReference:ref,amount:Object.freeze({...input.amount}),state:'PENDING' as const,createdAt:input.at});this.byRef.set(ref,intent as PaymentIntent);this.byKey.set(input.idempotencyKey,intent as PaymentIntent);return intent as PaymentIntent;
 }
 getIntent(ref:string){return this.byRef.get(ref);}
}

export class SandboxWebhookVerifier implements PaymentWebhookVerifier{
 constructor(private readonly secret:string){if(!secret.trim()) throw new Error('SANDBOX_WEBHOOK_SECRET_REQUIRED');}
 verify(input:{rawBody:string;signature:string}):VerifiedProviderWebhook{
  if(input.signature!==`sandbox:${this.secret}:${input.rawBody}`) throw new Error('PAYMENT_WEBHOOK_SIGNATURE_INVALID');let parsed:any;try{parsed=JSON.parse(input.rawBody);}catch{throw new Error('PAYMENT_WEBHOOK_BODY_INVALID');}
  if(!parsed||typeof parsed.providerReference!=='string'||!['CONFIRMED','FAILED'].includes(parsed.status)||typeof parsed.amountMinor!=='string'||!['GHS','USD'].includes(parsed.currency)||typeof parsed.occurredAt!=='string') throw new Error('PAYMENT_WEBHOOK_BODY_INVALID');validTime(parsed.occurredAt);
  return Object.freeze({providerReference:parsed.providerReference,status:parsed.status,amount:Object.freeze({minor:BigInt(parsed.amountMinor),currency:parsed.currency}),occurredAt:parsed.occurredAt});
 }
}

export interface PaymentReconciliationReceipt {readonly eventId:string;readonly evidenceId:EvidenceId;readonly providerReference:string;readonly status:ProviderTerminalStatus;readonly economicTreatment:'RESTRICTED_MEMBER_PREPAYMENT';}

export class PilotPaymentService{
 private receipts=new Map<string,PaymentReconciliationReceipt>();
 private receiptsByProviderReference=new Map<string,{receipt:PaymentReconciliationReceipt;amount:Money}>();
 constructor(private readonly provider:PaymentProvider,private readonly verifier:PaymentWebhookVerifier,private readonly demand:InMemoryDemandCommitmentLedger){}
 createIntent(input:{obligationId:ObligationId;participantId:ParticipantId;offer:MemberOffer;idempotencyKey:string;at:string}):PaymentIntent{
  const c=this.demand.getCommitment(input.obligationId);if(!c) throw new Error('PAYMENT_OBLIGATION_UNKNOWN');if(c.participantId!==input.participantId) throw new Error('PAYMENT_PARTICIPANT_MISMATCH');if(c.offerId!==input.offer.id) throw new Error('PAYMENT_OFFER_MISMATCH');if(c.obligation.quantity.unit!==input.offer.priceBasis.unit||c.obligation.quantity.amount!==input.offer.priceBasis.amount) throw new Error('PAYMENT_FIXED_PACK_REQUIRED');return this.provider.createIntent({obligationId:input.obligationId,participantId:input.participantId,offerId:input.offer.id,amount:input.offer.memberPrice,idempotencyKey:input.idempotencyKey,at:input.at});
 }
 reconcileWebhook(input:{eventId:string;rawBody:string;signature:string;receivedAt:string}):PaymentReconciliationReceipt{
  validTime(input.receivedAt);const prior=this.receipts.get(input.eventId);if(prior) return prior;const verified=this.verifier.verify({rawBody:input.rawBody,signature:input.signature});const intent=this.provider.getIntent(verified.providerReference);if(!intent) throw new Error('PAYMENT_INTENT_UNKNOWN');if(!sameMoney(intent.amount,verified.amount)) throw new Error('PAYMENT_AMOUNT_MISMATCH');
  const priorByRef=this.receiptsByProviderReference.get(verified.providerReference);if(priorByRef){if(!sameMoney(priorByRef.amount,verified.amount)) throw new Error('PAYMENT_PROVIDER_REFERENCE_AMOUNT_CONFLICT');if(priorByRef.receipt.status!==verified.status) throw new Error('PAYMENT_PROVIDER_TERMINAL_CONFLICT');this.receipts.set(input.eventId,priorByRef.receipt);return priorByRef.receipt;}
  const persisted=this.demand.findPaymentByProviderReference(intent.provider,verified.providerReference);
  if(persisted){if(!sameMoney(persisted.amount,verified.amount)) throw new Error('PAYMENT_PROVIDER_REFERENCE_AMOUNT_CONFLICT');if(persisted.status!==verified.status) throw new Error('PAYMENT_PROVIDER_TERMINAL_CONFLICT');const treatment=this.demand.paymentTreatment(persisted.evidenceId);if(treatment.classification!=='RESTRICTED_MEMBER_PREPAYMENT') throw new Error('PAYMENT_TREATMENT_INVALID');const receipt=Object.freeze({eventId:input.eventId,evidenceId:persisted.evidenceId,providerReference:persisted.providerReference,status:verified.status,economicTreatment:'RESTRICTED_MEMBER_PREPAYMENT' as const});this.receipts.set(input.eventId,receipt);this.receiptsByProviderReference.set(intent.providerReference,{receipt,amount:Object.freeze({...persisted.amount})});return receipt;}
  const evidenceId=asId<'EvidenceId'>(`evidence:payment:${input.eventId}`);const record:PaymentEvidenceRecord={evidenceId,obligationId:intent.obligationId,provider:intent.provider,providerReference:intent.providerReference,amount:verified.amount,status:verified.status,observedAt:verified.occurredAt,recordedAt:input.receivedAt};this.demand.recordPaymentEvidence(record);const treatment=this.demand.paymentTreatment(evidenceId);if(treatment.classification!=='RESTRICTED_MEMBER_PREPAYMENT') throw new Error('PAYMENT_TREATMENT_INVALID');const receipt=Object.freeze({eventId:input.eventId,evidenceId,providerReference:intent.providerReference,status:verified.status,economicTreatment:'RESTRICTED_MEMBER_PREPAYMENT' as const});this.receipts.set(input.eventId,receipt);this.receiptsByProviderReference.set(intent.providerReference,{receipt,amount:Object.freeze({...verified.amount})});return receipt;
 }
}
