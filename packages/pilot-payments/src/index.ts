import type {AuthorityGrantId,EvidenceId,Money,ObligationId,OfferId,ParticipantId} from '../../kernel/src/index.js';
import {asId} from '../../kernel/src/index.js';
import type {MemberOffer} from '../../catalog/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import {InMemoryDemandCommitmentLedger,type PaymentEvidenceRecord} from '../../demand/src/index.js';

export type ProviderTerminalStatus='CONFIRMED'|'FAILED';
export interface PaymentIntent {readonly id:string;readonly obligationId:ObligationId;readonly participantId:ParticipantId;readonly offerId:OfferId;readonly provider:string;readonly providerReference:string;readonly amount:Money;readonly state:'PENDING';readonly createdAt:string;}
export interface VerifiedProviderWebhook {readonly providerReference:string;readonly status:ProviderTerminalStatus;readonly amount:Money;readonly occurredAt:string;}
export interface PaymentWebhookVerifier {verify(input:{rawBody:string;signature:string}):VerifiedProviderWebhook;}
export interface PaymentProvider {readonly name:string;createIntent(input:{obligationId:ObligationId;participantId:ParticipantId;offerId:OfferId;amount:Money;idempotencyKey:string;at:string}):PaymentIntent;getIntent(providerReference:string):PaymentIntent|undefined;getIntentForObligation(obligationId:ObligationId):PaymentIntent|undefined;}
export interface PaymentOperationContext {readonly actorId:ParticipantId;readonly grantIds:readonly AuthorityGrantId[];readonly at:string;}

const validTime=(v:string)=>{if(Number.isNaN(Date.parse(v))) throw new Error('PAYMENT_TIME_INVALID');};
const sameMoney=(a:Money,b:Money)=>a.currency===b.currency&&a.minor===b.minor;

export class SandboxPaymentProvider implements PaymentProvider{
 readonly name='SANDBOX_MOMO';private seq=0;private byRef=new Map<string,PaymentIntent>();private byKey=new Map<string,PaymentIntent>();private byObligation=new Map<ObligationId,PaymentIntent>();
 createIntent(input:{obligationId:ObligationId;participantId:ParticipantId;offerId:OfferId;amount:Money;idempotencyKey:string;at:string}):PaymentIntent{
  validTime(input.at);if(!input.idempotencyKey.trim()) throw new Error('PAYMENT_IDEMPOTENCY_KEY_REQUIRED');
  const existing=this.byObligation.get(input.obligationId);if(existing){if(existing.participantId!==input.participantId||existing.offerId!==input.offerId||!sameMoney(existing.amount,input.amount)) throw new Error('PAYMENT_OBLIGATION_INTENT_CONFLICT');return existing;}
  const prior=this.byKey.get(input.idempotencyKey);if(prior){if(prior.obligationId!==input.obligationId||prior.participantId!==input.participantId||prior.offerId!==input.offerId||!sameMoney(prior.amount,input.amount)) throw new Error('PAYMENT_IDEMPOTENCY_CONFLICT');return prior;}
  const ref=`sandbox-ref-${++this.seq}`;const intent:Object=Object.freeze({id:`payment-intent-${this.seq}`,obligationId:input.obligationId,participantId:input.participantId,offerId:input.offerId,provider:this.name,providerReference:ref,amount:Object.freeze({...input.amount}),state:'PENDING' as const,createdAt:input.at});this.byRef.set(ref,intent as PaymentIntent);this.byKey.set(input.idempotencyKey,intent as PaymentIntent);this.byObligation.set(input.obligationId,intent as PaymentIntent);return intent as PaymentIntent;
 }
 getIntent(ref:string){return this.byRef.get(ref);}
 getIntentForObligation(id:ObligationId){return this.byObligation.get(id);}
}

export class SandboxWebhookVerifier implements PaymentWebhookVerifier{
 constructor(private readonly secret:string){if(!secret.trim()) throw new Error('SANDBOX_WEBHOOK_SECRET_REQUIRED');}
 verify(input:{rawBody:string;signature:string}):VerifiedProviderWebhook{
  if(input.signature!==`sandbox:${this.secret}:${input.rawBody}`) throw new Error('PAYMENT_WEBHOOK_SIGNATURE_INVALID');let parsed:any;try{parsed=JSON.parse(input.rawBody);}catch{throw new Error('PAYMENT_WEBHOOK_BODY_INVALID');}
  if(!parsed||typeof parsed.providerReference!=='string'||!['CONFIRMED','FAILED'].includes(parsed.status)||typeof parsed.amountMinor!=='string'||!['GHS','USD'].includes(parsed.currency)||typeof parsed.occurredAt!=='string') throw new Error('PAYMENT_WEBHOOK_BODY_INVALID');validTime(parsed.occurredAt);
  return Object.freeze({providerReference:parsed.providerReference,status:parsed.status,amount:Object.freeze({minor:BigInt(parsed.amountMinor),currency:parsed.currency}),occurredAt:parsed.occurredAt});
 }
}

export interface PaymentReconciliationReceipt {readonly eventId:string;readonly evidenceId:EvidenceId;readonly providerReference:string;readonly status:ProviderTerminalStatus;readonly economicTreatment:'RESTRICTED_MEMBER_PREPAYMENT'|'NO_ECONOMIC_EFFECT';}

export class PilotPaymentService{
 private receipts=new Map<string,PaymentReconciliationReceipt>();
 private receiptsByProviderReference=new Map<string,{receipt:PaymentReconciliationReceipt;amount:Money}>();
 constructor(private readonly provider:PaymentProvider,private readonly verifier:PaymentWebhookVerifier,private readonly demand:InMemoryDemandCommitmentLedger,private readonly authority:AuthorityEvaluator){}
 createIntent(ctx:PaymentOperationContext,input:{obligationId:ObligationId;participantId:ParticipantId;offer:MemberOffer;idempotencyKey:string}):PaymentIntent{
  validTime(ctx.at);const c=this.demand.getCommitment(input.obligationId);if(!c) throw new Error('PAYMENT_OBLIGATION_UNKNOWN');if(c.participantId!==input.participantId||ctx.actorId!==input.participantId) throw new Error('PAYMENT_PARTICIPANT_MISMATCH');if(c.offerId!==input.offer.id) throw new Error('PAYMENT_OFFER_MISMATCH');
  if(c.obligation.quantity.unit!==c.committedPriceBasis.unit||c.obligation.quantity.amount!==c.committedPriceBasis.amount) throw new Error('PAYMENT_FIXED_PACK_REQUIRED');
  if(!sameMoney(c.committedMemberPrice,input.offer.memberPrice)||input.offer.priceBasis.unit!==c.committedPriceBasis.unit||input.offer.priceBasis.amount!==c.committedPriceBasis.amount) throw new Error('PAYMENT_OFFER_ECONOMICS_MISMATCH');
  const decision=this.authority.evaluate({actorId:ctx.actorId,action:'payment.initiate',targetId:String(input.obligationId),at:ctx.at,grantIds:ctx.grantIds,quantity:c.obligation.quantity.amount});if(!decision.allowed) throw new Error(`PAYMENT_UNAUTHORIZED:${decision.reason}`);
  const existing=this.provider.getIntentForObligation(input.obligationId);if(existing){if(existing.participantId!==c.participantId||existing.offerId!==c.offerId||!sameMoney(existing.amount,c.committedMemberPrice)) throw new Error('PAYMENT_OBLIGATION_INTENT_CONFLICT');return existing;}
  return this.provider.createIntent({obligationId:input.obligationId,participantId:c.participantId,offerId:c.offerId,amount:c.committedMemberPrice,idempotencyKey:input.idempotencyKey,at:ctx.at});
 }
 reconcileWebhook(input:{eventId:string;rawBody:string;signature:string;receivedAt:string}):PaymentReconciliationReceipt{
  validTime(input.receivedAt);const verified=this.verifier.verify({rawBody:input.rawBody,signature:input.signature});const intent=this.provider.getIntent(verified.providerReference);if(!intent) throw new Error('PAYMENT_INTENT_UNKNOWN');if(!sameMoney(intent.amount,verified.amount)) throw new Error('PAYMENT_AMOUNT_MISMATCH');
  const priorEvent=this.receipts.get(input.eventId);if(priorEvent){const priorPayment=this.demand.getPayment(priorEvent.evidenceId);if(!priorPayment||priorEvent.providerReference!==verified.providerReference||priorEvent.status!==verified.status||!sameMoney(priorPayment.amount,verified.amount)) throw new Error('PAYMENT_EVENT_REPLAY_CONFLICT');return priorEvent;}
  const priorByRef=this.receiptsByProviderReference.get(verified.providerReference);if(priorByRef){if(!sameMoney(priorByRef.amount,verified.amount)) throw new Error('PAYMENT_PROVIDER_REFERENCE_AMOUNT_CONFLICT');if(priorByRef.receipt.status!==verified.status) throw new Error('PAYMENT_PROVIDER_TERMINAL_CONFLICT');this.receipts.set(input.eventId,priorByRef.receipt);return priorByRef.receipt;}
  const persisted=this.demand.findPaymentByProviderReference(intent.provider,verified.providerReference);
  if(persisted){if(!sameMoney(persisted.amount,verified.amount)) throw new Error('PAYMENT_PROVIDER_REFERENCE_AMOUNT_CONFLICT');if(persisted.status!==verified.status) throw new Error('PAYMENT_PROVIDER_TERMINAL_CONFLICT');const treatment=this.demand.paymentTreatment(persisted.evidenceId);const receipt=Object.freeze({eventId:input.eventId,evidenceId:persisted.evidenceId,providerReference:persisted.providerReference,status:verified.status,economicTreatment:treatment.classification});this.receipts.set(input.eventId,receipt);this.receiptsByProviderReference.set(intent.providerReference,{receipt,amount:Object.freeze({...persisted.amount})});return receipt;}
  const evidenceId=asId<'EvidenceId'>(`evidence:payment:${input.eventId}`);const record:PaymentEvidenceRecord={evidenceId,obligationId:intent.obligationId,provider:intent.provider,providerReference:intent.providerReference,amount:verified.amount,status:verified.status,observedAt:verified.occurredAt,recordedAt:input.receivedAt};this.demand.recordPaymentEvidence(record);const treatment=this.demand.paymentTreatment(evidenceId);const receipt=Object.freeze({eventId:input.eventId,evidenceId,providerReference:intent.providerReference,status:verified.status,economicTreatment:treatment.classification});this.receipts.set(input.eventId,receipt);this.receiptsByProviderReference.set(intent.providerReference,{receipt,amount:Object.freeze({...verified.amount})});return receipt;
 }
}
