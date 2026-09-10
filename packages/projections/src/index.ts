export interface CanonicalProjectionRecord<T=unknown>{readonly stream:string;readonly sequence:number;readonly recordId:string;readonly occurredAt:string;readonly payload:T;}
export interface ProjectionCheckpoint{readonly projection:string;readonly throughSequence:number;readonly rebuiltAt:string;readonly sourceCount:number;}
export interface ProjectionSnapshot<T>{readonly projection:string;readonly rows:ReadonlyMap<string,T>;readonly checkpoint:ProjectionCheckpoint;}
export interface ProjectionDefinition<T>{readonly name:string;readonly key:(record:CanonicalProjectionRecord)=>string|undefined;readonly reduce:(current:T|undefined,record:CanonicalProjectionRecord)=>T|undefined;}

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const ordered=(records:readonly CanonicalProjectionRecord[])=>[...records].sort((a,b)=>a.sequence-b.sequence||a.recordId.localeCompare(b.recordId));
const immutableClone=<T>(value:T):T=>{
 if(value===null||typeof value!=='object') return value;
 if(Array.isArray(value)) return Object.freeze(value.map(x=>immutableClone(x))) as T;
 const source=value as Record<string,unknown>;
 const copy:Record<string,unknown>={};
 for(const [key,item] of Object.entries(source)) copy[key]=immutableClone(item);
 return Object.freeze(copy) as T;
};

export class CanonicalRecordLog{
 private readonly records:CanonicalProjectionRecord[]=[];private readonly recordIds=new Set<string>();private readonly sequences=new Set<number>();
 append<T>(record:CanonicalProjectionRecord<T>):CanonicalProjectionRecord<T>{
  if(!record.stream.trim()||!record.recordId.trim()||record.sequence<=0||!Number.isInteger(record.sequence)||!validTime(record.occurredAt)) throw new Error('CANONICAL_RECORD_INVALID');
  if(this.recordIds.has(record.recordId)) throw new Error('CANONICAL_RECORD_ID_DUPLICATE');
  if(this.sequences.has(record.sequence)) throw new Error('CANONICAL_SEQUENCE_DUPLICATE');
  const frozen=Object.freeze({...record,payload:immutableClone(record.payload)});this.records.push(frozen);this.recordIds.add(record.recordId);this.sequences.add(record.sequence);return frozen;
 }
 all():readonly CanonicalProjectionRecord[]{return Object.freeze(ordered(this.records));}
}

export class RebuildableProjection<T>{
 private rows=new Map<string,T>();
 private checkpoint:ProjectionCheckpoint;
 constructor(private readonly definition:ProjectionDefinition<T>){this.checkpoint=Object.freeze({projection:definition.name,throughSequence:0,rebuiltAt:new Date(0).toISOString(),sourceCount:0});}
 rebuild(records:readonly CanonicalProjectionRecord[],rebuiltAt:string):ProjectionSnapshot<T>{
  if(!validTime(rebuiltAt)) throw new Error('PROJECTION_REBUILD_TIME_INVALID');
  const next=new Map<string,T>();const source=ordered(records);let previous=0;
  for(const record of source){if(record.sequence<=previous) throw new Error('PROJECTION_SOURCE_SEQUENCE_INVALID');previous=record.sequence;const key=this.definition.key(record);if(!key) continue;const value=this.definition.reduce(next.get(key),record);if(value===undefined)next.delete(key);else next.set(key,value);}
  this.rows=next;this.checkpoint=Object.freeze({projection:this.definition.name,throughSequence:source.at(-1)?.sequence??0,rebuiltAt,sourceCount:source.length});return this.snapshot();
 }
 drop():void{this.rows=new Map();this.checkpoint=Object.freeze({projection:this.definition.name,throughSequence:0,rebuiltAt:new Date(0).toISOString(),sourceCount:0});}
 snapshot():ProjectionSnapshot<T>{return Object.freeze({projection:this.definition.name,rows:new Map(this.rows),checkpoint:this.checkpoint});}
 get(key:string){return this.rows.get(key);}
}

export interface MemberOperationalView{readonly participantId:string;readonly membershipState:'ACTIVE'|'SUSPENDED'|'ENDED';readonly sourceRecordId:string;}
export interface InventoryOperationalView{readonly lotId:string;readonly specificationId:string;readonly receivedQuantity:number;readonly allocatedQuantity:number;readonly availableQuantity:number;readonly qualityState:'PENDING_INSPECTION'|'ACCEPTED'|'QUARANTINED'|'REJECTED';readonly sourceRecordIds:readonly string[];}
export interface FulfillmentOperationalView{readonly obligationId:string;readonly requiredQuantity:number;readonly acceptedQuantity:number;readonly state:'OPEN'|'PARTIALLY_DISCHARGED'|'DISCHARGED';readonly sourceRecordIds:readonly string[];}
export interface SavingsOperationalView{readonly obligationId:string;readonly savingsMinor:bigint;readonly currency:string;readonly savingsEntryId:string;readonly sourceRecordIds:readonly string[];}

type MemberPayload={kind:'MEMBERSHIP';participantId:string;state:MemberOperationalView['membershipState']};
type InventoryPayload={kind:'LOT_RECEIVED';lotId:string;specificationId:string;quantity:number}|{kind:'QUALITY';lotId:string;state:InventoryOperationalView['qualityState']}|{kind:'ALLOCATION';lotId:string;quantity:number};
type FulfillmentPayload={kind:'OBLIGATION_OPENED';obligationId:string;quantity:number}|{kind:'ACCEPTANCE';obligationId:string;quantity:number};
type SavingsPayload={kind:'SAVINGS';obligationId:string;entryId:string;minor:bigint;currency:string;supersedes?:string};

export const memberProjection:ProjectionDefinition<MemberOperationalView>={name:'member-operational',key:r=>(r.payload as MemberPayload).kind==='MEMBERSHIP'?(r.payload as MemberPayload).participantId:undefined,reduce:(_c,r)=>{const p=r.payload as MemberPayload;return Object.freeze({participantId:p.participantId,membershipState:p.state,sourceRecordId:r.recordId});}};
export const inventoryProjection:ProjectionDefinition<InventoryOperationalView>={name:'inventory-operational',key:r=>{const p=r.payload as InventoryPayload;return p.kind==='LOT_RECEIVED'||p.kind==='QUALITY'||p.kind==='ALLOCATION'?p.lotId:undefined;},reduce:(c,r)=>{const p=r.payload as InventoryPayload;if(p.kind==='LOT_RECEIVED')return Object.freeze({lotId:p.lotId,specificationId:p.specificationId,receivedQuantity:p.quantity,allocatedQuantity:0,availableQuantity:0,qualityState:'PENDING_INSPECTION' as const,sourceRecordIds:[r.recordId]});if(!c)throw new Error('PROJECTION_LOT_LINEAGE_MISSING');if(p.kind==='QUALITY')return Object.freeze({...c,qualityState:p.state,availableQuantity:p.state==='ACCEPTED'?c.receivedQuantity-c.allocatedQuantity:0,sourceRecordIds:[...c.sourceRecordIds,r.recordId]});const allocated=c.allocatedQuantity+p.quantity;if(allocated>c.receivedQuantity)throw new Error('PROJECTION_OVERALLOCATION');return Object.freeze({...c,allocatedQuantity:allocated,availableQuantity:c.qualityState==='ACCEPTED'?c.receivedQuantity-allocated:0,sourceRecordIds:[...c.sourceRecordIds,r.recordId]});}};
export const fulfillmentProjection:ProjectionDefinition<FulfillmentOperationalView>={name:'fulfillment-operational',key:r=>{const p=r.payload as FulfillmentPayload;return p.kind==='OBLIGATION_OPENED'||p.kind==='ACCEPTANCE'?p.obligationId:undefined;},reduce:(c,r)=>{const p=r.payload as FulfillmentPayload;if(p.kind==='OBLIGATION_OPENED')return Object.freeze({obligationId:p.obligationId,requiredQuantity:p.quantity,acceptedQuantity:0,state:'OPEN' as const,sourceRecordIds:[r.recordId]});if(!c)throw new Error('PROJECTION_OBLIGATION_LINEAGE_MISSING');const accepted=c.acceptedQuantity+p.quantity;if(accepted>c.requiredQuantity)throw new Error('PROJECTION_OVERDISCHARGE');return Object.freeze({...c,acceptedQuantity:accepted,state:accepted===0?'OPEN':accepted===c.requiredQuantity?'DISCHARGED':'PARTIALLY_DISCHARGED',sourceRecordIds:[...c.sourceRecordIds,r.recordId]});}};
export const savingsProjection:ProjectionDefinition<SavingsOperationalView>={name:'savings-operational',key:r=>(r.payload as SavingsPayload).kind==='SAVINGS'?(r.payload as SavingsPayload).obligationId:undefined,reduce:(c,r)=>{const p=r.payload as SavingsPayload;if(p.kind!=='SAVINGS')return c;if(p.supersedes&&c&&p.supersedes!==c.savingsEntryId)throw new Error('PROJECTION_SAVINGS_LINEAGE_INVALID');return Object.freeze({obligationId:p.obligationId,savingsMinor:p.minor,currency:p.currency,savingsEntryId:p.entryId,sourceRecordIds:[...(c?.sourceRecordIds??[]),r.recordId]});}};

export const snapshotDigest=<T>(snapshot:ProjectionSnapshot<T>)=>JSON.stringify([...snapshot.rows.entries()].sort(([a],[b])=>a.localeCompare(b)),(_k,v)=>typeof v==='bigint'?v.toString():v);
export const assertFresh=(snapshot:ProjectionSnapshot<unknown>,canonical:readonly CanonicalProjectionRecord[])=>{const latest=ordered(canonical).at(-1)?.sequence??0;if(snapshot.checkpoint.throughSequence!==latest)throw new Error('PROJECTION_STALE');};
