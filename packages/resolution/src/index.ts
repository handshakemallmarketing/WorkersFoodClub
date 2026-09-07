import type {ObligationId,Quantity} from '../../kernel/src/index.js';

export interface ResolutionObligation {readonly id:ObligationId;readonly quantity:Quantity;}
export interface ResolutionPosition {readonly obligationId:ObligationId;readonly performedQuantity:Quantity;readonly remediedQuantity:Quantity;readonly unresolvedQuantity:Quantity;}

const sameUnit=(a:Quantity,b:Quantity)=>a.unit===b.unit;

/**
 * Shared write-side conservation boundary for physical performance and economic remedy.
 * Fulfillment and remedy ledgers for the same application composition MUST share one instance.
 */
export class InMemoryObligationResolutionLedger {
 private readonly performed=new Map<string,{obligationId:ObligationId;quantity:Quantity}>();
 private readonly remedied=new Map<string,{obligationId:ObligationId;quantity:Quantity}>();
 private readonly totals=new Map<ObligationId,Quantity>();

 private register(obligation:ResolutionObligation){
  const prior=this.totals.get(obligation.id);
  if(prior&&(!sameUnit(prior,obligation.quantity)||prior.amount!==obligation.quantity.amount)) throw new Error('RESOLUTION_OBLIGATION_DRIFT');
  if(!prior){if(obligation.quantity.amount<=0) throw new Error('RESOLUTION_OBLIGATION_INVALID');this.totals.set(obligation.id,Object.freeze({...obligation.quantity}));}
 }
 private sum(map:Map<string,{obligationId:ObligationId;quantity:Quantity}>,id:ObligationId){return [...map.values()].filter(x=>x.obligationId===id).reduce((n,x)=>n+x.quantity.amount,0);}
 private assertCapacity(obligation:ResolutionObligation,delta:Quantity){
  this.register(obligation);
  if(delta.amount<0||!sameUnit(delta,obligation.quantity)) throw new Error('RESOLUTION_QUANTITY_INVALID');
  if(this.sum(this.performed,obligation.id)+this.sum(this.remedied,obligation.id)+delta.amount>obligation.quantity.amount) throw new Error('OBLIGATION_OVERRESOLUTION');
 }
 recordPerformed(effectId:string,obligation:ResolutionObligation,quantity:Quantity){
  if(this.performed.has(effectId)) throw new Error('PERFORMANCE_EFFECT_DUPLICATE');
  this.assertCapacity(obligation,quantity);
  this.performed.set(effectId,Object.freeze({obligationId:obligation.id,quantity:Object.freeze({...quantity})}));
 }
 recordRemedied(effectId:string,obligation:ResolutionObligation,quantity:Quantity){
  if(this.remedied.has(effectId)) throw new Error('REMEDY_EFFECT_DUPLICATE');
  this.assertCapacity(obligation,quantity);
  this.remedied.set(effectId,Object.freeze({obligationId:obligation.id,quantity:Object.freeze({...quantity})}));
 }
 position(obligation:ResolutionObligation):ResolutionPosition{
  this.register(obligation);
  const performed=this.sum(this.performed,obligation.id),remedied=this.sum(this.remedied,obligation.id),unresolved=obligation.quantity.amount-performed-remedied;
  return Object.freeze({obligationId:obligation.id,performedQuantity:Object.freeze({amount:performed,unit:obligation.quantity.unit}),remediedQuantity:Object.freeze({amount:remedied,unit:obligation.quantity.unit}),unresolvedQuantity:Object.freeze({amount:unresolved,unit:obligation.quantity.unit})});
 }
}
