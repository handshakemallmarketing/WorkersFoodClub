import type {AuthorityGrantId,ObligationId,ParticipantId,Quantity} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';
import type {InMemoryInventoryLedger,AllocationRecord} from '../../inventory/src/index.js';
import {InMemoryFulfillmentLedger,type FulfillmentWorkRecord,type PickupHandoverRecord,type MemberAcceptanceRecord} from '../../fulfillment/src/index.js';
import {InMemoryRemedyLedger,type ExceptionRecord} from '../../remedy/src/index.js';

export interface FulfillmentOperationContext {
 readonly actorId:ParticipantId;
 readonly grantIds:readonly AuthorityGrantId[];
 readonly at:string;
}

type FulfillmentObligationView={
 readonly id:ObligationId;
 readonly participantId:ParticipantId;
 readonly beneficiary:ParticipantId;
 readonly specificationId:ReturnType<InMemoryDemandCommitmentLedger['getCommitment']> extends infer _T ? any : never;
 readonly quantity:Quantity;
 readonly state:'OPEN';
};

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));

export class GovernedPilotFulfillmentService {
 constructor(
  private readonly authority:AuthorityEvaluator,
  private readonly inventory:Pick<InMemoryInventoryLedger,'getAllocation'>,
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'>,
  private readonly fulfillment:InMemoryFulfillmentLedger,
  private readonly remedies:InMemoryRemedyLedger
 ){}

 private authorize(ctx:FulfillmentOperationContext,action:string,targetId:string,quantity?:number){
  const decision=this.authority.evaluate({actorId:ctx.actorId,action,targetId,at:ctx.at,grantIds:ctx.grantIds,...(quantity===undefined?{}:{quantity})});
  if(!decision.allowed) throw new Error(`FULFILLMENT_UNAUTHORIZED:${decision.reason}`);
  return decision;
 }

 private order(obligationId:ObligationId){
  const commitment=this.demand.getCommitment(obligationId);
  if(!commitment) throw new Error('FULFILLMENT_OBLIGATION_UNKNOWN');
  return Object.freeze({
   id:commitment.obligation.id,
   participantId:commitment.participantId,
   beneficiary:commitment.participantId,
   specificationId:commitment.obligation.specificationId,
   quantity:commitment.obligation.quantity,
   state:'OPEN' as const
  });
 }

 private allocation(id:string):AllocationRecord{
  const allocation=this.inventory.getAllocation(id);
  if(!allocation) throw new Error('FULFILLMENT_ALLOCATION_UNKNOWN');
  return allocation;
 }

 recordWork(ctx:FulfillmentOperationContext,input:FulfillmentWorkRecord){
  if(input.operatorId!==ctx.actorId) throw new Error('FULFILLMENT_OPERATOR_ACTOR_MISMATCH');
  if(!validTime(input.occurredAt)||Date.parse(input.occurredAt)>Date.parse(ctx.at)) throw new Error('FULFILLMENT_WORK_TIME_INVALID');
  const allocation=this.allocation(input.allocationId);
  const order=this.order(allocation.obligationId);
  if(order.id!==allocation.obligationId) throw new Error('FULFILLMENT_OBLIGATION_MISMATCH');
  const action=input.state==='PICKED'?'fulfillment.pick':input.state==='PACKED'?'fulfillment.pack':'fulfillment.ready';
  this.authorize(ctx,action,String(allocation.lotId),input.quantity.amount);
  return this.fulfillment.recordWork(input,{allocationId:allocation.id,lotId:allocation.lotId,obligationId:allocation.obligationId,specificationId:allocation.specificationId,quantity:allocation.quantity});
 }

 handover(ctx:FulfillmentOperationContext,input:PickupHandoverRecord){
  if(input.fromCustodianId!==ctx.actorId) throw new Error('HANDOVER_CUSTODIAN_ACTOR_MISMATCH');
  if(!validTime(input.handedOverAt)||Date.parse(input.handedOverAt)>Date.parse(ctx.at)) throw new Error('HANDOVER_TIME_INVALID');
  const work=this.fulfillment.getWork(input.fulfillmentWorkId);
  if(!work) throw new Error('HANDOVER_WORK_UNKNOWN');
  const order=this.order(input.obligationId);
  this.authorize(ctx,'fulfillment.handover',String(input.obligationId),work.quantity.amount);
  return this.fulfillment.handover(input,order);
 }

 accept(ctx:FulfillmentOperationContext,input:MemberAcceptanceRecord){
  if(input.participantId!==ctx.actorId) throw new Error('ACCEPTANCE_ACTOR_MISMATCH');
  if(!validTime(input.acceptedAt)||Date.parse(input.acceptedAt)>Date.parse(ctx.at)) throw new Error('ACCEPTANCE_TIME_INVALID');
  const order=this.order(input.obligationId);
  this.authorize(ctx,'fulfillment.accept',String(input.obligationId),input.quantity.amount);
  return this.fulfillment.accept(input,order);
 }

 recordException(ctx:FulfillmentOperationContext,input:ExceptionRecord){
  if(input.participantId!==ctx.actorId) throw new Error('EXCEPTION_ACTOR_MISMATCH');
  if(!validTime(input.occurredAt)||Date.parse(input.occurredAt)>Date.parse(ctx.at)) throw new Error('EXCEPTION_TIME_INVALID');
  const order=this.order(input.obligationId);
  this.authorize(ctx,'fulfillment.exception',String(input.obligationId),input.affectedQuantity.amount);
  if((input.kind==='SHORTFALL'||input.kind==='REJECTION')&&!input.relatedAcceptanceId) throw new Error('EXCEPTION_ACCEPTANCE_LINK_REQUIRED');
  if(input.relatedAcceptanceId){
   const acceptance=this.fulfillment.getAcceptance(input.relatedAcceptanceId);
   if(!acceptance||acceptance.obligationId!==input.obligationId||acceptance.participantId!==input.participantId) throw new Error('EXCEPTION_ACCEPTANCE_MISMATCH');
  }
  return this.remedies.recordException(input,order);
 }

 performance(obligationId:ObligationId){return this.fulfillment.performance(this.order(obligationId));}
 getException(id:string){return this.remedies.getException(id);}
}
