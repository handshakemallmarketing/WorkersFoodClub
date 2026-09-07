import type {CommandId,EvidenceId,Money,Obligation,ObligationId,OfferId,ParticipantId,Quantity,SpecificationId} from '../../kernel/src/index.js';
import type {MembershipRelationship} from '../../membership/src/index.js';
import {isWithinValidity,type MemberOffer} from '../../catalog/src/index.js';

export interface AcceptedCommandVerifier {isAccepted(commandId:string,eventId:string):boolean|Promise<boolean>;}
export type DemandSignalKind='FORECAST'|'INTEREST'|'REQUEST';
export interface DemandSignal {readonly id:string;readonly participantId:ParticipantId;readonly specificationId:SpecificationId;readonly quantity:Quantity;readonly kind:DemandSignalKind;readonly observedAt:string;readonly evidenceIds:readonly EvidenceId[];}
export interface PurchaseCommitmentRecord {readonly obligation:Obligation;readonly participantId:ParticipantId;readonly membershipId:string;readonly offerId:OfferId;readonly sourceDemandSignalId?:string;readonly authorizedCommandId:CommandId;readonly authorizedEventId:string;readonly acceptedAt:string;readonly policyVersions:readonly string[];}
export type PaymentEvidenceStatus='PENDING'|'CONFIRMED'|'FAILED'|'REVERSED';
export interface PaymentEvidenceRecord {readonly evidenceId:EvidenceId;readonly obligationId:ObligationId;readonly provider:string;readonly providerReference:string;readonly amount:Money;readonly status:PaymentEvidenceStatus;readonly observedAt:string;readonly recordedAt:string;}
export interface PaymentEconomicTreatment {readonly earnedRevenue:false;readonly unrestrictedCapital:false;readonly classification:'RESTRICTED_MEMBER_PREPAYMENT';readonly linkedObligationId:ObligationId;}
const validTime=(value:string)=>!Number.isNaN(Date.parse(value));

export class InMemoryDemandCommitmentLedger {
 private readonly signals=new Map<string,DemandSignal>(); private readonly commitments=new Map<ObligationId,PurchaseCommitmentRecord>(); private readonly payments=new Map<EvidenceId,PaymentEvidenceRecord>(); private readonly providerRefs=new Set<string>(); private readonly consumedAuthorizations=new Set<string>();
 constructor(private readonly commandVerifier?:AcceptedCommandVerifier){}
 recordSignal(signal:DemandSignal):DemandSignal{if(this.signals.has(signal.id)) throw new Error('DEMAND_SIGNAL_ID_DUPLICATE');if(signal.quantity.amount<=0) throw new Error('DEMAND_SIGNAL_QUANTITY_INVALID');if(!validTime(signal.observedAt)) throw new Error('DEMAND_SIGNAL_TIME_INVALID');const frozen=Object.freeze({...signal,evidenceIds:[...signal.evidenceIds]});this.signals.set(signal.id,frozen);return frozen;}
 async commitPurchase(input:{obligationId:ObligationId;participantId:ParticipantId;membership:MembershipRelationship;offer:MemberOffer;quantity:Quantity;sourceDemandSignalId?:string;authorizedCommandId:CommandId;authorizedEventId:string;acceptedAt:string;policyVersions:readonly string[]}):Promise<PurchaseCommitmentRecord>{
  if(this.commitments.has(input.obligationId)) throw new Error('OBLIGATION_ID_DUPLICATE');
  if(input.membership.participantId!==input.participantId) throw new Error('MEMBERSHIP_PARTICIPANT_MISMATCH'); if(input.membership.state!=='ACTIVE') throw new Error('PURCHASE_REQUIRES_ACTIVE_MEMBERSHIP');
  if(input.quantity.amount<=0||input.quantity.unit!==input.offer.quantity.unit||input.quantity.amount>input.offer.quantity.amount) throw new Error('PURCHASE_QUANTITY_OUT_OF_OFFER');
  if(!validTime(input.acceptedAt)) throw new Error('PURCHASE_TIME_INVALID'); if(!isWithinValidity(input.offer.validFrom,input.offer.validUntil,input.acceptedAt)) throw new Error('OFFER_NOT_EXECUTABLE');
  if(!String(input.authorizedCommandId).trim()||!input.authorizedEventId.trim()) throw new Error('AUTHORIZED_COMMITMENT_EVENT_REQUIRED'); if(!this.commandVerifier) throw new Error('COMMAND_VERIFIER_REQUIRED');
  if(input.sourceDemandSignalId){const signal=this.signals.get(input.sourceDemandSignalId);if(!signal) throw new Error('DEMAND_SIGNAL_UNKNOWN');if(signal.participantId!==input.participantId) throw new Error('DEMAND_SIGNAL_PARTICIPANT_MISMATCH');if(signal.specificationId!==input.offer.specificationId) throw new Error('DEMAND_SIGNAL_SPECIFICATION_MISMATCH');}
  const authorizationKey=`${String(input.authorizedCommandId)}:${input.authorizedEventId}`; if(this.consumedAuthorizations.has(authorizationKey)) throw new Error('AUTHORIZED_COMMITMENT_ALREADY_CONSUMED');
  // Reserve before awaiting verification so concurrent calls cannot both consume one accepted effect.
  this.consumedAuthorizations.add(authorizationKey);
  try{if(!(await this.commandVerifier.isAccepted(String(input.authorizedCommandId),input.authorizedEventId))) throw new Error('AUTHORIZED_COMMITMENT_NOT_VERIFIED');}
  catch(error){this.consumedAuthorizations.delete(authorizationKey);throw error;}
  const obligation:Obligation=Object.freeze({id:input.obligationId,obligor:input.participantId,beneficiary:input.offer.offerorId,specificationId:input.offer.specificationId,quantity:input.quantity,state:'OPEN'});
  const record:PurchaseCommitmentRecord=Object.freeze({obligation,participantId:input.participantId,membershipId:input.membership.id,offerId:input.offer.id,...(input.sourceDemandSignalId!==undefined?{sourceDemandSignalId:input.sourceDemandSignalId}:{}),authorizedCommandId:input.authorizedCommandId,authorizedEventId:input.authorizedEventId,acceptedAt:input.acceptedAt,policyVersions:[...input.policyVersions]});
  this.commitments.set(input.obligationId,record);return record;
 }
 recordPaymentEvidence(payment:PaymentEvidenceRecord):PaymentEvidenceRecord{if(this.payments.has(payment.evidenceId)) throw new Error('PAYMENT_EVIDENCE_DUPLICATE');if(this.providerRefs.has(`${payment.provider}:${payment.providerReference}`)) throw new Error('PAYMENT_PROVIDER_REFERENCE_DUPLICATE');if(!this.commitments.has(payment.obligationId)) throw new Error('PAYMENT_OBLIGATION_UNKNOWN');if(!payment.provider.trim()||!payment.providerReference.trim()) throw new Error('PAYMENT_PROVIDER_REFERENCE_REQUIRED');if(!validTime(payment.observedAt)||!validTime(payment.recordedAt)) throw new Error('PAYMENT_TIME_INVALID');const frozen=Object.freeze({...payment});this.payments.set(payment.evidenceId,frozen);this.providerRefs.add(`${payment.provider}:${payment.providerReference}`);return frozen;}
 paymentTreatment(evidenceId:EvidenceId):PaymentEconomicTreatment{const p=this.payments.get(evidenceId);if(!p) throw new Error('PAYMENT_EVIDENCE_NOT_FOUND');return Object.freeze({earnedRevenue:false,unrestrictedCapital:false,classification:'RESTRICTED_MEMBER_PREPAYMENT',linkedObligationId:p.obligationId});}
 getSignal(id:string){return this.signals.get(id);} getCommitment(id:ObligationId){return this.commitments.get(id);} getPayment(id:EvidenceId){return this.payments.get(id);} paymentsFor(id:ObligationId){return [...this.payments.values()].filter(x=>x.obligationId===id);}
}
