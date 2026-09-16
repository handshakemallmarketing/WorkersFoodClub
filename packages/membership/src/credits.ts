import type {ParticipantId} from '../../kernel/src/index.js';

export type ShoppingCreditSource='MEMBERSHIP_FEE_SPENDING_CREDIT'|'PROMOTIONAL_CREDIT'|'SHIPPING_CREDIT';
export type ShoppingCreditState='AVAILABLE'|'RESERVED'|'REDEEMED'|'EXPIRED';
export type ShoppingCreditFunding='MEMBER_FUNDED'|'CLUB_FUNDED';
export type ShoppingCreditApplicability='MERCHANDISE'|'SHIPPING';

export interface ShoppingCreditLot {
 readonly id:string;
 readonly participantId:ParticipantId;
 readonly source:ShoppingCreditSource;
 readonly funding:ShoppingCreditFunding;
 readonly applicability:ShoppingCreditApplicability;
 readonly issuedMinor:number;
 readonly availableMinor:number;
 readonly issuedAt:string;
 readonly expiresAt?:string;
 readonly sourceReference:string;
 readonly campaignReference?:string;
 readonly state:ShoppingCreditState;
}

function oneYearAfter(at:string):string{
 const issued=new Date(at);if(Number.isNaN(issued.getTime()))throw new Error('SHOPPING_CREDIT_ISSUED_AT_INVALID');
 const expiry=new Date(issued);expiry.setUTCFullYear(expiry.getUTCFullYear()+1);return expiry.toISOString();
}

export class InMemoryShoppingCreditStore {
 private readonly lots=new Map<string,ShoppingCreditLot>();
 private readonly sourceReferences=new Map<string,string>();
 issue(input:{id:string;participantId:ParticipantId;source:ShoppingCreditSource;funding:ShoppingCreditFunding;applicability:ShoppingCreditApplicability;amountMinor:number;issuedAt:string;expiresAt?:string;sourceReference:string;campaignReference?:string}):ShoppingCreditLot{
  if(this.lots.has(input.id)) throw new Error('SHOPPING_CREDIT_ID_DUPLICATE');
  if(!input.sourceReference.trim()) throw new Error('SHOPPING_CREDIT_SOURCE_REFERENCE_REQUIRED');
  const existing=this.sourceReferences.get(input.sourceReference);if(existing){const lot=this.lots.get(existing);if(!lot)throw new Error('SHOPPING_CREDIT_LEDGER_CORRUPT');return lot;}
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) throw new Error('SHOPPING_CREDIT_AMOUNT_INVALID');
  if(Number.isNaN(Date.parse(input.issuedAt))) throw new Error('SHOPPING_CREDIT_ISSUED_AT_INVALID');
  if(input.expiresAt!==undefined && (Number.isNaN(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=Date.parse(input.issuedAt))) throw new Error('SHOPPING_CREDIT_EXPIRY_INVALID');
  if(input.source==='PROMOTIONAL_CREDIT'&&!input.campaignReference?.trim())throw new Error('PROMOTIONAL_CREDIT_CAMPAIGN_REQUIRED');
  if(input.source==='SHIPPING_CREDIT'&&(input.funding!=='MEMBER_FUNDED'||input.applicability!=='SHIPPING'))throw new Error('SHIPPING_CREDIT_ACCOUNTING_INVALID');
  if(input.source!=='SHIPPING_CREDIT'&&(input.funding!=='CLUB_FUNDED'||input.applicability!=='MERCHANDISE'))throw new Error('MERCHANDISE_CREDIT_ACCOUNTING_INVALID');
  const lot=this.freeze({...input,issuedMinor:input.amountMinor,availableMinor:input.amountMinor,state:'AVAILABLE' as const});
  this.lots.set(lot.id,lot);this.sourceReferences.set(input.sourceReference,lot.id);return lot;
 }
 issueMembershipFeeSpendingCredit(input:{id:string;participantId:ParticipantId;annualFeeMinor:number;issuedAt:string;sourceReference:string}):ShoppingCreditLot{
  return this.issue({id:input.id,participantId:input.participantId,source:'MEMBERSHIP_FEE_SPENDING_CREDIT',funding:'CLUB_FUNDED',applicability:'MERCHANDISE',amountMinor:input.annualFeeMinor,issuedAt:input.issuedAt,expiresAt:oneYearAfter(input.issuedAt),sourceReference:input.sourceReference});
 }
 issuePromotionalCredit(input:{id:string;participantId:ParticipantId;amountMinor:number;issuedAt:string;sourceReference:string;campaignReference:string}):ShoppingCreditLot{
  return this.issue({...input,source:'PROMOTIONAL_CREDIT',funding:'CLUB_FUNDED',applicability:'MERCHANDISE',expiresAt:oneYearAfter(input.issuedAt)});
 }
 issueShippingCredit(input:{id:string;participantId:ParticipantId;amountMinor:number;issuedAt:string;sourceReference:string}):ShoppingCreditLot{
  return this.issue({...input,source:'SHIPPING_CREDIT',funding:'MEMBER_FUNDED',applicability:'SHIPPING'});
 }
 expire(at:string):readonly ShoppingCreditLot[]{
  const now=Date.parse(at);if(Number.isNaN(now))throw new Error('SHOPPING_CREDIT_EXPIRY_TIME_INVALID');const expired:ShoppingCreditLot[]=[];
  for(const lot of this.lots.values()) if(lot.state==='AVAILABLE'&&lot.expiresAt!==undefined&&now>=Date.parse(lot.expiresAt)){const next=this.freeze({...lot,availableMinor:0,state:'EXPIRED' as const});this.lots.set(lot.id,next);expired.push(next);}
  return Object.freeze(expired);
 }
 balance(participantId:ParticipantId,at?:string):number{if(at!==undefined)this.expire(at);return [...this.lots.values()].filter(x=>x.participantId===participantId&&x.state==='AVAILABLE').reduce((sum,x)=>sum+x.availableMinor,0);}
 balanceBySource(participantId:ParticipantId,source:ShoppingCreditSource,at?:string):number{if(at!==undefined)this.expire(at);return [...this.lots.values()].filter(x=>x.participantId===participantId&&x.source===source&&x.state==='AVAILABLE').reduce((sum,x)=>sum+x.availableMinor,0);}
 balanceByApplicability(participantId:ParticipantId,applicability:ShoppingCreditApplicability,at?:string):number{if(at!==undefined)this.expire(at);return [...this.lots.values()].filter(x=>x.participantId===participantId&&x.applicability===applicability&&x.state==='AVAILABLE').reduce((sum,x)=>sum+x.availableMinor,0);}
 get(id:string){return this.lots.get(id);}
 private freeze(value:ShoppingCreditLot):ShoppingCreditLot{return Object.freeze({...value});}
}
