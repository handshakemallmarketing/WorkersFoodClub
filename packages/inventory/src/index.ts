import type {EvidenceId,LotId,ObligationId,ParticipantId,Quantity,SpecificationId,TraceabilityLot} from '../../kernel/src/index.js';

export type QualityState='PENDING_INSPECTION'|'ACCEPTED'|'QUARANTINED'|'REJECTED';

export interface LotReceiptRecord {
 readonly lot:TraceabilityLot;
 readonly ownerId:ParticipantId;
 readonly custodianId:ParticipantId;
 readonly placeId:string;
 readonly receivedAt:string;
 readonly receiptEvidenceIds:readonly EvidenceId[];
}

export interface QualityAssessment {
 readonly id:string;
 readonly lotId:LotId;
 readonly state:QualityState;
 readonly assessedAt:string;
 readonly evidenceIds:readonly EvidenceId[];
 readonly supersedes?:string;
}

export interface AllocationRecord {
 readonly id:string;
 readonly lotId:LotId;
 readonly obligationId:ObligationId;
 readonly specificationId:SpecificationId;
 readonly quantity:Quantity;
 readonly allocatedAt:string;
 readonly evidenceIds:readonly EvidenceId[];
}

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));

export class InMemoryInventoryLedger {
 private readonly receipts=new Map<LotId,LotReceiptRecord>();
 private readonly quality=new Map<LotId,QualityAssessment[]>();
 private readonly allocations=new Map<string,AllocationRecord>();

 receiveLot(input:LotReceiptRecord):LotReceiptRecord{
  if(this.receipts.has(input.lot.id)) throw new Error('LOT_ID_DUPLICATE');
  if(input.lot.quantity.amount<=0) throw new Error('LOT_QUANTITY_INVALID');
  if(!validTime(input.receivedAt)) throw new Error('LOT_RECEIPT_TIME_INVALID');
  if(!input.placeId.trim()||input.receiptEvidenceIds.length===0) throw new Error('LOT_RECEIPT_EVIDENCE_REQUIRED');
  const frozen=Object.freeze({...input,lot:Object.freeze({...input.lot,quantity:Object.freeze({...input.lot.quantity})}),receiptEvidenceIds:[...input.receiptEvidenceIds]});
  this.receipts.set(input.lot.id,frozen);
  return frozen;
 }

 assessQuality(input:QualityAssessment):QualityAssessment{
  if(!this.receipts.has(input.lotId)) throw new Error('QUALITY_LOT_UNKNOWN');
  if(!validTime(input.assessedAt)||input.evidenceIds.length===0) throw new Error('QUALITY_EVIDENCE_REQUIRED');
  const history=this.quality.get(input.lotId)??[];
  if(history.some(x=>x.id===input.id)) throw new Error('QUALITY_ASSESSMENT_ID_DUPLICATE');
  const latest=history.at(-1);
  if(latest && input.supersedes!==latest.id) throw new Error('QUALITY_CORRECTION_LINEAGE_REQUIRED');
  const frozen=Object.freeze({...input,evidenceIds:[...input.evidenceIds]});
  history.push(frozen); this.quality.set(input.lotId,history); return frozen;
 }

 allocate(input:AllocationRecord, obligation:{id:ObligationId;specificationId:SpecificationId;quantity:Quantity;state:string}):AllocationRecord{
  if(this.allocations.has(input.id)) throw new Error('ALLOCATION_ID_DUPLICATE');
  const receipt=this.receipts.get(input.lotId); if(!receipt) throw new Error('ALLOCATION_LOT_UNKNOWN');
  const q=this.currentQuality(input.lotId); if(!q||q.state!=='ACCEPTED') throw new Error('LOT_NOT_ALLOCATABLE');
  if(obligation.id!==input.obligationId||obligation.state==='DISCHARGED'||obligation.state==='BREACHED') throw new Error('OBLIGATION_NOT_ALLOCATABLE');
  if(receipt.lot.specificationId!==obligation.specificationId||input.specificationId!==obligation.specificationId) throw new Error('ALLOCATION_SPECIFICATION_MISMATCH');
  if(input.quantity.amount<=0||input.quantity.unit!==receipt.lot.quantity.unit||input.quantity.unit!==obligation.quantity.unit) throw new Error('ALLOCATION_QUANTITY_INVALID');
  if(!validTime(input.allocatedAt)) throw new Error('ALLOCATION_TIME_INVALID');
  const lotAllocated=this.allocatedForLot(input.lotId); if(lotAllocated+input.quantity.amount>receipt.lot.quantity.amount) throw new Error('LOT_OVERALLOCATION');
  const obligationAllocated=this.allocatedForObligation(input.obligationId); if(obligationAllocated+input.quantity.amount>obligation.quantity.amount) throw new Error('OBLIGATION_OVERALLOCATION');
  const frozen=Object.freeze({...input,quantity:Object.freeze({...input.quantity}),evidenceIds:[...input.evidenceIds]});
  this.allocations.set(input.id,frozen); return frozen;
 }

 currentQuality(lotId:LotId){ const h=this.quality.get(lotId); return h?.at(-1); }
 allocatedForLot(lotId:LotId){ return [...this.allocations.values()].filter(x=>x.lotId===lotId).reduce((n,x)=>n+x.quantity.amount,0); }
 allocatedForObligation(id:ObligationId){ return [...this.allocations.values()].filter(x=>x.obligationId===id).reduce((n,x)=>n+x.quantity.amount,0); }
 availableForLot(lotId:LotId):Quantity{
  const r=this.receipts.get(lotId); if(!r) throw new Error('LOT_NOT_FOUND');
  return Object.freeze({amount:r.lot.quantity.amount-this.allocatedForLot(lotId),unit:r.lot.quantity.unit});
 }
 getReceipt(id:LotId){return this.receipts.get(id);}
 getAllocation(id:string){return this.allocations.get(id);}
}
