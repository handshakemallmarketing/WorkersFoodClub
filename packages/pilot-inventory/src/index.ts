import type {AuthorityGrantId,EvidenceId,LotId,ObligationId,ParticipantId,Quantity,SpecificationId,TraceabilityLot} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import {ExplicitPhysicalLineageLedger,type ExplicitPhysicalTransform} from '../../lineage/src/index.js';
import {InMemoryInventoryLedger,type AllocationRecord,type LotReceiptRecord,type QualityAssessment} from '../../inventory/src/index.js';

export interface InventoryOperationContext {
 readonly actorId:ParticipantId;
 readonly grantIds:readonly AuthorityGrantId[];
 readonly at:string;
}

export class GovernedPilotInventoryService {
 constructor(
  private readonly authority:AuthorityEvaluator,
  private readonly inventory:InMemoryInventoryLedger,
  private readonly lineage:ExplicitPhysicalLineageLedger
 ){}

 private authorize(ctx:InventoryOperationContext,action:string,targetId:string){
  const decision=this.authority.evaluate({actorId:ctx.actorId,action,targetId,at:ctx.at,grantIds:ctx.grantIds});
  if(!decision.allowed) throw new Error(`INVENTORY_UNAUTHORIZED:${decision.reason}`);
  return decision;
 }

 receiveLot(ctx:InventoryOperationContext,input:LotReceiptRecord){
  this.authorize(ctx,'inventory.receive',String(input.lot.id));
  if(input.custodianId!==ctx.actorId) throw new Error('LOT_CUSTODIAN_ACTOR_MISMATCH');
  const receipt=this.inventory.receiveLot(input);
  this.lineage.registerLot(String(input.lot.id),input.lot.quantity);
  return receipt;
 }

 assessQuality(ctx:InventoryOperationContext,input:QualityAssessment){
  this.authorize(ctx,'inventory.quality.assess',String(input.lotId));
  return this.inventory.assessQuality(input);
 }

 transform(ctx:InventoryOperationContext,input:ExplicitPhysicalTransform){
  this.authorize(ctx,'inventory.transform',input.id);
  return this.lineage.transform(input);
 }

 receiveDerivedLot(ctx:InventoryOperationContext,input:{lot:TraceabilityLot;ownerId:ParticipantId;custodianId:ParticipantId;placeId:string;receivedAt:string;receiptEvidenceIds:readonly EvidenceId[]}){
  this.authorize(ctx,'inventory.receive-derived',String(input.lot.id));
  if(input.custodianId!==ctx.actorId) throw new Error('LOT_CUSTODIAN_ACTOR_MISMATCH');
  const remaining=this.lineage.remaining(String(input.lot.id));
  if(remaining.unit!==input.lot.quantity.unit||remaining.amount!==input.lot.quantity.amount) throw new Error('DERIVED_LOT_LINEAGE_QUANTITY_MISMATCH');
  return this.inventory.receiveLot(input);
 }

 allocate(ctx:InventoryOperationContext,input:{allocation:AllocationRecord;obligation:{id:ObligationId;specificationId:SpecificationId;quantity:Quantity;state:string}}){
  this.authorize(ctx,'inventory.allocate',input.allocation.id);
  return this.inventory.allocate(input.allocation,input.obligation);
 }

 availability(lotId:LotId){return this.inventory.availableForLot(lotId);}
 currentQuality(lotId:LotId){return this.inventory.currentQuality(lotId);}
 ancestry(lotId:LotId){return this.lineage.ancestry(String(lotId));}
}
