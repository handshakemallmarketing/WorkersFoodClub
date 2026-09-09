import type {AuthorityGrantId,EvidenceId,LotId,ParticipantId,Quantity,TraceabilityLot} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import {ExplicitPhysicalLineageLedger,type ExplicitPhysicalTransform} from '../../lineage/src/index.js';
import {InMemoryInventoryLedger,type AllocationRecord,type LotReceiptRecord,type QualityAssessment} from '../../inventory/src/index.js';
import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';

export interface InventoryOperationContext {
 readonly actorId:ParticipantId;
 readonly grantIds:readonly AuthorityGrantId[];
 readonly at:string;
}

export class GovernedPilotInventoryService {
 constructor(
  private readonly authority:AuthorityEvaluator,
  private readonly inventory:InMemoryInventoryLedger,
  private readonly lineage:ExplicitPhysicalLineageLedger,
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'>
 ){}

 private authorize(ctx:InventoryOperationContext,action:string,targetId:string,quantity?:number){
  const decision=this.authority.evaluate({actorId:ctx.actorId,action,targetId,at:ctx.at,grantIds:ctx.grantIds,...(quantity===undefined?{}:{quantity})});
  if(!decision.allowed) throw new Error(`INVENTORY_UNAUTHORIZED:${decision.reason}`);
  return decision;
 }

 private lineageKnown(lotId:string){
  try{this.lineage.remaining(lotId);return true;}
  catch(error){if(error instanceof Error&&error.message==='LINEAGE_LOT_UNKNOWN')return false;throw error;}
 }

 private prevalidateReceipt(input:LotReceiptRecord){
  if(this.inventory.getReceipt(input.lot.id)) throw new Error('LOT_ID_DUPLICATE');
  if(!String(input.lot.id).trim()||this.lineageKnown(String(input.lot.id))) throw new Error('LINEAGE_LOT_INVALID');
  if(!Number.isFinite(input.lot.quantity.amount)||input.lot.quantity.amount<=0) throw new Error('LOT_QUANTITY_INVALID');
  if(Number.isNaN(Date.parse(input.receivedAt))) throw new Error('LOT_RECEIPT_TIME_INVALID');
  if(!input.placeId.trim()||input.receiptEvidenceIds.length===0) throw new Error('LOT_RECEIPT_EVIDENCE_REQUIRED');
 }

 receiveLot(ctx:InventoryOperationContext,input:LotReceiptRecord){
  this.authorize(ctx,'inventory.receive',String(input.lot.id),input.lot.quantity.amount);
  if(input.custodianId!==ctx.actorId) throw new Error('LOT_CUSTODIAN_ACTOR_MISMATCH');
  this.prevalidateReceipt(input);
  const receipt=this.inventory.receiveLot(input);
  this.lineage.registerLot(String(input.lot.id),input.lot.quantity);
  return receipt;
 }

 assessQuality(ctx:InventoryOperationContext,input:QualityAssessment){
  const receipt=this.inventory.getReceipt(input.lotId);if(!receipt) throw new Error('QUALITY_LOT_UNKNOWN');
  this.authorize(ctx,'inventory.quality.assess',String(input.lotId),receipt.lot.quantity.amount);
  if(!Number.isNaN(Date.parse(input.assessedAt))&&Date.parse(input.assessedAt)>Date.parse(ctx.at)) throw new Error('QUALITY_ASSESSMENT_FROM_FUTURE');
  return this.inventory.assessQuality(input);
 }

 transform(ctx:InventoryOperationContext,input:ExplicitPhysicalTransform){
  if(!Number.isNaN(Date.parse(input.occurredAt))&&Date.parse(input.occurredAt)>Date.parse(ctx.at)) throw new Error('TRANSFORMATION_FROM_FUTURE');
  for(const port of input.inputs){
   const lotId=port.lotId as LotId;
   if(!this.inventory.getReceipt(lotId)) throw new Error('TRANSFORMATION_INPUT_NOT_RECEIVED');
   this.authorize(ctx,'inventory.transform',port.lotId,port.quantity.amount);
   const available=this.availability(lotId);
   if(port.quantity.unit!==available.unit||port.quantity.amount>available.amount) throw new Error('TRANSFORMATION_INPUT_EXCEEDS_AVAILABLE');
  }
  return this.lineage.transform(input);
 }

 receiveDerivedLot(ctx:InventoryOperationContext,input:{lot:TraceabilityLot;ownerId:ParticipantId;custodianId:ParticipantId;placeId:string;receivedAt:string;receiptEvidenceIds:readonly EvidenceId[]}){
  this.authorize(ctx,'inventory.receive-derived',String(input.lot.id),input.lot.quantity.amount);
  if(input.custodianId!==ctx.actorId) throw new Error('LOT_CUSTODIAN_ACTOR_MISMATCH');
  if(this.inventory.getReceipt(input.lot.id)) throw new Error('LOT_ID_DUPLICATE');
  if(!input.placeId.trim()||input.receiptEvidenceIds.length===0||Number.isNaN(Date.parse(input.receivedAt))||input.lot.quantity.amount<=0) throw new Error('DERIVED_LOT_RECEIPT_INVALID');
  if(!this.lineage.ancestry(String(input.lot.id)).some(x=>x.direction==='OUTPUT')) throw new Error('DERIVED_LOT_LINEAGE_REQUIRED');
  const remaining=this.lineage.remaining(String(input.lot.id));
  if(remaining.unit!==input.lot.quantity.unit||remaining.amount!==input.lot.quantity.amount) throw new Error('DERIVED_LOT_LINEAGE_QUANTITY_MISMATCH');
  return this.inventory.receiveLot(input);
 }

 allocate(ctx:InventoryOperationContext,input:{allocation:AllocationRecord}){
  const commitment=this.demand.getCommitment(input.allocation.obligationId);if(!commitment) throw new Error('ALLOCATION_OBLIGATION_UNKNOWN');
  this.authorize(ctx,'inventory.allocate',String(input.allocation.lotId),input.allocation.quantity.amount);
  const available=this.availability(input.allocation.lotId);
  if(input.allocation.quantity.unit===available.unit&&input.allocation.quantity.amount>available.amount) throw new Error('LOT_OVERALLOCATION');
  return this.inventory.allocate(input.allocation,commitment.obligation);
 }

 availability(lotId:LotId):Quantity{
  const receipt=this.inventory.getReceipt(lotId);if(!receipt) throw new Error('LOT_NOT_FOUND');
  const quality=this.inventory.currentQuality(lotId);
  if(!quality||quality.state!=='ACCEPTED') return Object.freeze({amount:0,unit:receipt.lot.quantity.unit});
  const physical=this.lineage.remaining(String(lotId));
  if(physical.unit!==receipt.lot.quantity.unit) throw new Error('LINEAGE_INVENTORY_UNIT_MISMATCH');
  return Object.freeze({amount:Math.max(0,physical.amount-this.inventory.allocatedForLot(lotId)),unit:physical.unit});
 }
 currentQuality(lotId:LotId){return this.inventory.currentQuality(lotId);}
 ancestry(lotId:LotId){return this.lineage.ancestry(String(lotId));}
}
