import type {ObligationId,ParticipantId,Quantity,SpecificationId} from '../../kernel/src/index.js';
import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';
import {InMemoryEconomicsLedger,type FulfilledMemberEconomics,type SavingsEntry} from '../../economics/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../resolution/src/index.js';
import type {CanonicalProjectionRecord,ProjectionDefinition} from '../../projections/src/index.js';

const sameQuantity=(a:Quantity,b:Quantity)=>a.unit===b.unit&&a.amount===b.amount;
const validTime=(v:string)=>!Number.isNaN(Date.parse(v));

export class GovernedMemberEconomicsService{
 constructor(
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'>,
  private readonly resolution:InMemoryObligationResolutionLedger,
  private readonly economics:InMemoryEconomicsLedger
 ){}
 recordFulfilledEconomics(input:FulfilledMemberEconomics){
  const commitment=this.demand.getCommitment(input.obligationId);
  if(!commitment) throw new Error('MEMBER_ECONOMICS_OBLIGATION_UNKNOWN');
  if(input.participantId!==commitment.participantId) throw new Error('MEMBER_ECONOMICS_PARTICIPANT_MISMATCH');
  if(input.specificationId!==commitment.obligation.specificationId) throw new Error('MEMBER_ECONOMICS_SPECIFICATION_MISMATCH');
  const position=this.resolution.position({id:commitment.obligation.id,quantity:commitment.obligation.quantity});
  if(!sameQuantity(input.quantity,position.performedQuantity)||input.quantity.amount<=0) throw new Error('MEMBER_ECONOMICS_NOT_ACTUAL_PERFORMANCE');
  if(!validTime(input.realizedAt)||Date.parse(input.realizedAt)<Date.parse(commitment.acceptedAt)) throw new Error('MEMBER_ECONOMICS_TIME_INVALID');
  return this.economics.recordFulfilledMemberEconomics(input);
 }
 calculateSavings(input:{id:string;benchmarkValuationId:string;memberEconomicsId:string;calculatedAt:string;supersedes?:string}):SavingsEntry{
  return this.economics.calculateSavings(input);
 }
}

export interface MemberOrderOperationalView{
 readonly obligationId:string;
 readonly participantId:string;
 readonly specificationId:string;
 readonly committedQuantity:number;
 readonly unit:string;
 readonly performedQuantity:number;
 readonly remediedQuantity:number;
 readonly unresolvedQuantity:number;
 readonly latestSavingsMinor?:bigint;
 readonly savingsCurrency?:string;
 readonly savingsEntryId?:string;
 readonly sourceRecordIds:readonly string[];
}

type OrderPayload=
 |{kind:'ORDER_COMMITTED';obligationId:string;participantId:string;specificationId:string;quantity:number;unit:string}
 |{kind:'ORDER_RESOLUTION';obligationId:string;performedQuantity:number;remediedQuantity:number;unresolvedQuantity:number;unit:string}
 |{kind:'ORDER_SAVINGS';obligationId:string;entryId:string;minor:bigint;currency:string;supersedes?:string};

export const memberOrderProjection:ProjectionDefinition<MemberOrderOperationalView>={
 name:'member-order-history',
 key:(r:CanonicalProjectionRecord)=>{const p=r.payload as OrderPayload;return p.kind==='ORDER_COMMITTED'||p.kind==='ORDER_RESOLUTION'||p.kind==='ORDER_SAVINGS'?p.obligationId:undefined;},
 reduce:(current,r)=>{
  const p=r.payload as OrderPayload;
  if(p.kind==='ORDER_COMMITTED'){
   if(current) throw new Error('ORDER_PROJECTION_COMMITMENT_DUPLICATE');
   if(p.quantity<=0) throw new Error('ORDER_PROJECTION_QUANTITY_INVALID');
   return Object.freeze({obligationId:p.obligationId,participantId:p.participantId,specificationId:p.specificationId,committedQuantity:p.quantity,unit:p.unit,performedQuantity:0,remediedQuantity:0,unresolvedQuantity:p.quantity,sourceRecordIds:[r.recordId]});
  }
  if(!current) throw new Error('ORDER_PROJECTION_LINEAGE_MISSING');
  if(p.kind==='ORDER_RESOLUTION'){
   if(p.unit!==current.unit||p.performedQuantity<0||p.remediedQuantity<0||p.unresolvedQuantity<0||p.performedQuantity+p.remediedQuantity+p.unresolvedQuantity!==current.committedQuantity) throw new Error('ORDER_PROJECTION_RESOLUTION_INVALID');
   return Object.freeze({...current,performedQuantity:p.performedQuantity,remediedQuantity:p.remediedQuantity,unresolvedQuantity:p.unresolvedQuantity,sourceRecordIds:[...current.sourceRecordIds,r.recordId]});
  }
  if(p.supersedes&&current.savingsEntryId&&p.supersedes!==current.savingsEntryId) throw new Error('ORDER_PROJECTION_SAVINGS_LINEAGE_INVALID');
  return Object.freeze({...current,latestSavingsMinor:p.minor,savingsCurrency:p.currency,savingsEntryId:p.entryId,sourceRecordIds:[...current.sourceRecordIds,r.recordId]});
 }
};
