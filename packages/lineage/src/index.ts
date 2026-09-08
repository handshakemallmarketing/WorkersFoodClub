import type {EvidenceId,Quantity} from '../../kernel/src/index.js';

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const positive=(q:Quantity)=>Number.isFinite(q.amount)&&q.amount>0;
const cloneQ=(q:Quantity)=>Object.freeze({...q});

export type TransformationKind='SPLIT'|'MERGE'|'REPACK'|'PROCESS'|'RETURN'|'MEASURED_VARIANCE';
export interface LineagePort{readonly lotId:string;readonly quantity:Quantity;}
export interface ExplicitPhysicalTransform{
 readonly id:string;
 readonly kind:TransformationKind;
 readonly inputs:readonly LineagePort[];
 readonly outputs:readonly LineagePort[];
 readonly lossQuantity:Quantity;
 readonly occurredAt:string;
 readonly evidenceIds:readonly EvidenceId[];
}
export interface LineageEdge{readonly transformId:string;readonly direction:'INPUT'|'OUTPUT';readonly lotId:string;readonly quantity:Quantity;}

/**
 * Explicit in-memory reference model for physical lineage.
 * Every input and output lot carries its own quantity. No equal-split inference is permitted.
 * The durable PostgreSQL representation is packages/durability/sql/004_physical_lineage.sql.
 */
export class ExplicitPhysicalLineageLedger{
 private readonly capacities=new Map<string,Quantity>();
 private readonly consumed=new Map<string,number>();
 private readonly transforms=new Map<string,ExplicitPhysicalTransform>();
 private readonly edges:LineageEdge[]=[];

 registerLot(lotId:string,quantity:Quantity){
  if(!lotId.trim()||this.capacities.has(lotId)||!positive(quantity))throw new Error('LINEAGE_LOT_INVALID');
  const frozen=cloneQ(quantity);this.capacities.set(lotId,frozen);return frozen;
 }

 transform(input:ExplicitPhysicalTransform){
  if(!input.id.trim()||this.transforms.has(input.id)||input.inputs.length===0||input.outputs.length===0||input.evidenceIds.length===0||!validTime(input.occurredAt))throw new Error('TRANSFORMATION_EVIDENCE_REQUIRED');
  const inputIds=input.inputs.map(x=>x.lotId),outputIds=input.outputs.map(x=>x.lotId);
  if(new Set(inputIds).size!==inputIds.length||new Set(outputIds).size!==outputIds.length||inputIds.some(x=>outputIds.includes(x)))throw new Error('TRANSFORMATION_LOT_DUPLICATE');
  const unit=input.inputs[0]!.quantity.unit;
  for(const p of [...input.inputs,...input.outputs])if(!p.lotId.trim()||!positive(p.quantity)||p.quantity.unit!==unit)throw new Error('TRANSFORMATION_QUANTITY_INVALID');
  if(input.lossQuantity.unit!==unit||input.lossQuantity.amount<0)throw new Error('TRANSFORMATION_QUANTITY_INVALID');
  const totalIn=input.inputs.reduce((n,x)=>n+x.quantity.amount,0);
  const totalOut=input.outputs.reduce((n,x)=>n+x.quantity.amount,0);
  if(Math.abs(totalIn-totalOut-input.lossQuantity.amount)>1e-9)throw new Error('TRANSFORMATION_NOT_CONSERVED');
  for(const p of input.inputs){const cap=this.capacities.get(p.lotId);if(!cap||cap.unit!==unit)throw new Error('TRANSFORMATION_INPUT_LOT_UNKNOWN');const used=this.consumed.get(p.lotId)??0;if(used+p.quantity.amount>cap.amount+1e-9)throw new Error('TRANSFORMATION_INPUT_OVERCONSUMED');}
  for(const p of input.outputs)if(this.capacities.has(p.lotId))throw new Error('TRANSFORMATION_OUTPUT_LOT_DUPLICATE');
  const frozen=Object.freeze({...input,inputs:input.inputs.map(p=>Object.freeze({lotId:p.lotId,quantity:cloneQ(p.quantity)})),outputs:input.outputs.map(p=>Object.freeze({lotId:p.lotId,quantity:cloneQ(p.quantity)})),lossQuantity:cloneQ(input.lossQuantity),evidenceIds:[...input.evidenceIds]});
  for(const p of frozen.inputs){this.consumed.set(p.lotId,(this.consumed.get(p.lotId)??0)+p.quantity.amount);this.edges.push(Object.freeze({transformId:input.id,direction:'INPUT' as const,lotId:p.lotId,quantity:cloneQ(p.quantity)}));}
  for(const p of frozen.outputs){this.capacities.set(p.lotId,p.quantity);this.edges.push(Object.freeze({transformId:input.id,direction:'OUTPUT' as const,lotId:p.lotId,quantity:cloneQ(p.quantity)}));}
  this.transforms.set(input.id,frozen);return frozen;
 }

 remaining(lotId:string){const cap=this.capacities.get(lotId);if(!cap)throw new Error('LINEAGE_LOT_UNKNOWN');return Object.freeze({amount:cap.amount-(this.consumed.get(lotId)??0),unit:cap.unit});}
 ancestry(lotId:string){return this.edges.filter(e=>e.lotId===lotId).map(e=>Object.freeze({...e,quantity:cloneQ(e.quantity)}));}
 getTransform(id:string){return this.transforms.get(id);}
}
