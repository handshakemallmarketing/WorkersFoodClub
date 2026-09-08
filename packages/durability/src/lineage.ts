import type {EvidenceId,Quantity,Unit} from '../../kernel/src/index.js';
import type {PgPool} from './postgres.js';

export type DurableTransformationKind='SPLIT'|'MERGE'|'REPACK'|'PROCESS'|'RETURN'|'MEASURED_VARIANCE';
export interface DurableLineagePort{readonly lotId:string;readonly quantity:Quantity;}
export interface DurableLineageTransform{
 readonly id:string;
 readonly kind:DurableTransformationKind;
 readonly inputs:readonly DurableLineagePort[];
 readonly outputs:readonly DurableLineagePort[];
 readonly lossQuantity:Quantity;
 readonly occurredAt:string;
 readonly evidenceIds:readonly EvidenceId[];
}

const positive=(q:Quantity)=>Number.isFinite(q.amount)&&q.amount>0;

/** PostgreSQL-backed explicit per-input/per-output physical lineage boundary. */
export class PostgresPhysicalLineageStore{
 constructor(private readonly pool:PgPool){}
 async registerLot(lotId:string,quantity:Quantity):Promise<void>{
  if(!lotId.trim()||!positive(quantity))throw new Error('LINEAGE_LOT_INVALID');
  const c=await this.pool.connect();try{await c.query('INSERT INTO lineage_lot(lot_id,quantity,unit) VALUES($1,$2,$3)',[lotId,quantity.amount,quantity.unit]);}finally{c.release?.();}
 }
 async transform(input:DurableLineageTransform):Promise<void>{
  if(!input.id.trim()||input.inputs.length===0||input.outputs.length===0||input.evidenceIds.length===0||Number.isNaN(Date.parse(input.occurredAt)))throw new Error('TRANSFORMATION_EVIDENCE_REQUIRED');
  const unit=input.inputs[0]!.quantity.unit;
  const inputJson=input.inputs.map(p=>({lotId:p.lotId,quantity:p.quantity.amount}));
  const outputJson=input.outputs.map(p=>({lotId:p.lotId,quantity:p.quantity.amount}));
  const c=await this.pool.connect();try{await c.query('SELECT record_lineage_transform($1,$2,$3,$4,$5,$6,$7,$8)',[input.id,input.kind,unit,input.lossQuantity.amount,input.occurredAt,input.evidenceIds,inputJson,outputJson]);}finally{c.release?.();}
 }
 async remaining(lotId:string):Promise<Quantity>{
  const c=await this.pool.connect();try{const r=await c.query<{remaining:string|number;unit:Unit}>('SELECT quantity-consumed_quantity AS remaining,unit FROM lineage_lot WHERE lot_id=$1',[lotId]);const row=r.rows[0];if(!row)throw new Error('LINEAGE_LOT_UNKNOWN');return Object.freeze({amount:Number(row.remaining),unit:row.unit});}finally{c.release?.();}
 }
 async ancestry(lotId:string){
  const c=await this.pool.connect();try{return (await c.query<{transform_id:string;direction:'INPUT'|'OUTPUT';lot_id:string;quantity:string|number;unit:Unit}>(`SELECT i.transform_id,'INPUT'::text AS direction,i.lot_id,i.quantity,t.unit FROM lineage_transform_input i JOIN lineage_transform t USING(transform_id) WHERE i.lot_id=$1 UNION ALL SELECT o.transform_id,'OUTPUT'::text AS direction,o.lot_id,o.quantity,t.unit FROM lineage_transform_output o JOIN lineage_transform t USING(transform_id) WHERE o.lot_id=$1 ORDER BY transform_id,direction`,[lotId])).rows.map(r=>Object.freeze({transformId:r.transform_id,direction:r.direction,lotId:r.lot_id,quantity:Object.freeze({amount:Number(r.quantity),unit:r.unit})}));}finally{c.release?.();}
 }
}
