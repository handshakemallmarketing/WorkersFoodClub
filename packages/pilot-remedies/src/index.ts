import type {AuthorityGrantId,ObligationId,ParticipantId,Quantity,SpecificationId} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';
import {InMemoryRemedyLedger,type RemedyObligation,type RemedyCompletion,type SubstitutionProposal} from '../../remedy/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../resolution/src/index.js';

export interface RemedyOperationContext {
 readonly actorId:ParticipantId;
 readonly grantIds:readonly AuthorityGrantId[];
 readonly at:string;
}

type RemedySourceObligation={
 readonly id:ObligationId;
 readonly participantId:ParticipantId;
 readonly specificationId:SpecificationId;
 readonly quantity:Quantity;
};

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));

export class GovernedPilotRemedyService {
 constructor(
  private readonly authority:AuthorityEvaluator,
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'>,
  private readonly remedies:InMemoryRemedyLedger,
  private readonly resolution:InMemoryObligationResolutionLedger
 ){
  if(this.remedies.resolutionLedger()!==this.resolution) throw new Error('REMEDY_RESOLUTION_LEDGER_MISMATCH');
 }

 private authorize(ctx:RemedyOperationContext,action:string,targetId:string,quantity?:number){
  const decision=this.authority.evaluate({actorId:ctx.actorId,action,targetId,at:ctx.at,grantIds:ctx.grantIds,...(quantity===undefined?{}:{quantity})});
  if(!decision.allowed) throw new Error(`REMEDY_UNAUTHORIZED:${decision.reason}`);
  return decision;
 }

 private order(obligationId:ObligationId):RemedySourceObligation{
  const commitment=this.demand.getCommitment(obligationId);
  if(!commitment) throw new Error('REMEDY_OBLIGATION_UNKNOWN');
  return Object.freeze({id:commitment.obligation.id,participantId:commitment.participantId,specificationId:commitment.obligation.specificationId,quantity:commitment.obligation.quantity});
 }

 proposeSubstitution(ctx:RemedyOperationContext,input:SubstitutionProposal){
  if(!validTime(input.proposedAt)||Date.parse(input.proposedAt)>Date.parse(ctx.at)) throw new Error('SUBSTITUTION_TIME_INVALID');
  const order=this.order(input.obligationId);
  this.authorize(ctx,'remedy.substitution.propose',String(input.obligationId),input.affectedQuantity.amount);
  return this.remedies.proposeSubstitution(input,order);
 }

 createRemedy(ctx:RemedyOperationContext,input:RemedyObligation){
  if(!validTime(input.createdAt)||Date.parse(input.createdAt)>Date.parse(ctx.at)) throw new Error('REMEDY_TIME_INVALID');
  const order=this.order(input.originalObligationId);
  const exception=this.remedies.getException(input.sourceExceptionId);
  if(!exception||exception.obligationId!==order.id||exception.participantId!==order.participantId) throw new Error('REMEDY_EXCEPTION_MISMATCH');
  if(input.participantId!==order.participantId) throw new Error('REMEDY_PARTICIPANT_MISMATCH');
  this.authorize(ctx,'remedy.create',String(input.originalObligationId),input.quantity.amount);
  return this.remedies.createRemedy(input);
 }

 completeRemedy(ctx:RemedyOperationContext,input:RemedyCompletion){
  if(!validTime(input.completedAt)||Date.parse(input.completedAt)>Date.parse(ctx.at)) throw new Error('REMEDY_COMPLETION_TIME_INVALID');
  const remedy=this.remedies.getRemedy(input.remedyObligationId);
  if(!remedy) throw new Error('REMEDY_UNKNOWN');
  const order=this.order(remedy.originalObligationId);
  this.authorize(ctx,'remedy.complete',String(order.id),input.quantity.amount);
  return this.remedies.completeRemedy(input);
 }

 position(obligationId:ObligationId){return this.resolution.position(this.order(obligationId));}
 resolutionLedger(){return this.remedies.resolutionLedger();}
 getRemedy(id:string){return this.remedies.getRemedy(id);}
 getCompletion(id:string){return this.remedies.getCompletion(id);}
}
