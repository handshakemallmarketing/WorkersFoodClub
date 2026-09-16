import type {ParticipantId} from '../../kernel/src/index.js';

export type ShoppingCreditSource='FOUNDING_COHORT_CREDIT'|'MEMBERSHIP_OVERPAYMENT_CREDIT';
export type ShoppingCreditState='AVAILABLE'|'RESERVED'|'REDEEMED'|'EXPIRED';

export interface ShoppingCreditLot {
 readonly id:string;
 readonly participantId:ParticipantId;
 readonly source:ShoppingCreditSource;
 readonly issuedMinor:number;
 readonly availableMinor:number;
 readonly issuedAt:string;
 readonly expiresAt?:string;
 readonly sourceReference:string;
 readonly state:ShoppingCreditState;
}

export class InMemoryShoppingCreditStore {
 private readonly lots=new Map<string,ShoppingCreditLot>();
 private readonly sourceReferences=new Map<string,string>();
 issue(input:{id:string;participantId:ParticipantId;source:ShoppingCreditSource;amountMinor:number;issuedAt:string;expiresAt?:string;sourceReference:string}):ShoppingCreditLot{
  if(this.lots.has(input.id)) throw new Error('SHOPPING_CREDIT_ID_DUPLICATE');
  if(!input.sourceReference.trim()) throw new Error('SHOPPING_CREDIT_SOURCE_REFERENCE_REQUIRED');
  const existing=this.sourceReferences.get(input.sourceReference);if(existing){const lot=this.lots.get(existing);if(!lot)throw new Error('SHOPPING_CREDIT_LEDGER_CORRUPT');return lot;}
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) throw new Error('SHOPPING_CREDIT_AMOUNT_INVALID');
  if(Number.isNaN(Date.parse(input.issuedAt))) throw new Error('SHOPPING_CREDIT_ISSUED_AT_INVALID');
  if(input.expiresAt!==undefined && (Number.isNaN(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=Date.parse(input.issuedAt))) throw new Error('SHOPPING_CREDIT_EXPIRY_INVALID');
  const lot=this.freeze({...input,issuedMinor:input.amountMinor,availableMinor:input.amountMinor,state:'AVAILABLE' as const});
  this.lots.set(lot.id,lot);this.sourceReferences.set(input.sourceReference,lot.id);return lot;
 }
 issueFoundingCohortCredit(input:{id:string;participantId:ParticipantId;annualFeeMinor:number;issuedAt:string;sourceReference:string}):ShoppingCreditLot{
  const issued=new Date(input.issuedAt);if(Number.isNaN(issued.getTime()))throw new Error('SHOPPING_CREDIT_ISSUED_AT_INVALID');
  const expiry=new Date(issued);expiry.setUTCFullYear(expiry.getUTCFullYear()+1);
  return this.issue({id:input.id,participantId:input.participantId,source:'FOUNDING_COHORT_CREDIT',amountMinor:input.annualFeeMinor,issuedAt:input.issuedAt,expiresAt:expiry.toISOString(),sourceReference:input.sourceReference});
 }
 expire(at:string):readonly ShoppingCreditLot[]{
  const now=Date.parse(at);if(Number.isNaN(now))throw new Error('SHOPPING_CREDIT_EXPIRY_TIME_INVALID');const expired:ShoppingCreditLot[]=[];
  for(const lot of this.lots.values()) if(lot.state==='AVAILABLE'&&lot.expiresAt!==undefined&&now>=Date.parse(lot.expiresAt)){const next=this.freeze({...lot,availableMinor:0,state:'EXPIRED' as const});this.lots.set(lot.id,next);expired.push(next);}
  return Object.freeze(expired);
 }
 balance(participantId:ParticipantId,at?:string):number{if(at!==undefined)this.expire(at);return [...this.lots.values()].filter(x=>x.participantId===participantId&&x.state==='AVAILABLE').reduce((sum,x)=>sum+x.availableMinor,0);}
 get(id:string){return this.lots.get(id);}
 private freeze(value:ShoppingCreditLot):ShoppingCreditLot{return Object.freeze({...value});}
}
