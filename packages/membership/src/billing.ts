import type {ParticipantId} from '../../kernel/src/index.js';
import {InMemoryShoppingCreditStore} from './credits.js';

export type MembershipInvoiceState='ISSUED'|'DUE'|'SETTLED'|'PAST_DUE'|'VOID';
export type MembershipStandingState='CURRENT'|'PAST_DUE'|'RESTRICTED';
export interface MembershipInvoice {
 readonly id:string;
 readonly participantId:ParticipantId;
 readonly amountMinor:number;
 readonly settledMinor:number;
 readonly state:MembershipInvoiceState;
 readonly issuedAt:string;
 readonly dueAt:string;
 readonly settlementReferences:readonly string[];
 readonly nonRefundable:true;
}
export interface MembershipSettlementResult {readonly invoice:MembershipInvoice;readonly overpaymentCreditMinor:number;readonly shoppingCreditLotId?:string;}
export interface MembershipStanding {readonly participantId:ParticipantId;readonly state:MembershipStandingState;readonly basisInvoiceIds:readonly string[];}

export class InMemoryMembershipBillingStore {
 private readonly invoices=new Map<string,MembershipInvoice>();
 constructor(private readonly shoppingCredits?:InMemoryShoppingCreditStore){}
 issue(input:{id:string;participantId:ParticipantId;amountMinor:number;issuedAt:string;dueAt:string}):MembershipInvoice{
  if(this.invoices.has(input.id)) throw new Error('MEMBERSHIP_INVOICE_ID_DUPLICATE');
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) throw new Error('MEMBERSHIP_INVOICE_AMOUNT_INVALID');
  if(Date.parse(input.dueAt)<Date.parse(input.issuedAt)) throw new Error('MEMBERSHIP_INVOICE_DUE_INVALID');
  const invoice=this.freeze({...input,settledMinor:0,state:'ISSUED' as const,settlementReferences:[],nonRefundable:true as const});this.invoices.set(invoice.id,invoice);return invoice;
 }
 markDue(id:string):MembershipInvoice{const i=this.require(id);if(i.state!=='ISSUED')throw new Error('MEMBERSHIP_INVOICE_NOT_ISSUED');return this.replace({...i,state:'DUE'});}
 recordAuthoritativeSettlement(id:string,input:{amountMinor:number;reference:string;recordedAt?:string}):MembershipSettlementResult{
  const i=this.require(id);if(i.state==='VOID')throw new Error('MEMBERSHIP_INVOICE_NOT_SETTLEABLE');
  if(!input.reference.trim())throw new Error('SETTLEMENT_REFERENCE_REQUIRED');
  if(i.settlementReferences.includes(input.reference))return Object.freeze({invoice:i,overpaymentCreditMinor:0});
  if(i.state==='SETTLED')throw new Error('MEMBERSHIP_INVOICE_NOT_SETTLEABLE');
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0)throw new Error('SETTLEMENT_AMOUNT_INVALID');
  if(input.amountMinor<i.amountMinor)throw new Error('ANNUAL_MEMBERSHIP_FEE_FULL_PAYMENT_REQUIRED');
  const excess=input.amountMinor-i.amountMinor;
  let shoppingCreditLotId:string|undefined;
  if(excess>0){
   if(!this.shoppingCredits)throw new Error('SHOPPING_CREDIT_STORE_REQUIRED_FOR_OVERPAYMENT');
   const lot=this.shoppingCredits.issue({id:`credit:membership-overpayment:${input.reference}`,participantId:i.participantId,source:'MEMBERSHIP_OVERPAYMENT_CREDIT',amountMinor:excess,issuedAt:input.recordedAt??new Date().toISOString(),sourceReference:`membership-overpayment:${input.reference}`});
   shoppingCreditLotId=lot.id;
  }
  const invoice=this.replace({...i,settledMinor:i.amountMinor,state:'SETTLED',settlementReferences:[...i.settlementReferences,input.reference]});
  return Object.freeze(shoppingCreditLotId===undefined?{invoice,overpaymentCreditMinor:excess}:{invoice,overpaymentCreditMinor:excess,shoppingCreditLotId});
 }
 markPastDue(id:string,at:string):MembershipInvoice{const i=this.require(id);if(i.state==='SETTLED'||i.state==='VOID')return i;if(Date.parse(at)<=Date.parse(i.dueAt))throw new Error('MEMBERSHIP_INVOICE_NOT_PAST_DUE');return this.replace({...i,state:'PAST_DUE'});}
 void(id:string):MembershipInvoice{const i=this.require(id);if(i.settledMinor>0)throw new Error('SETTLED_MEMBERSHIP_INVOICE_CANNOT_VOID');return this.replace({...i,state:'VOID'});}
 standing(participantId:ParticipantId,restricted:boolean):MembershipStanding{
  const pastDue=[...this.invoices.values()].filter(x=>x.participantId===participantId&&x.state==='PAST_DUE').map(x=>x.id);
  return Object.freeze({participantId,state:restricted&&pastDue.length?'RESTRICTED':pastDue.length?'PAST_DUE':'CURRENT',basisInvoiceIds:Object.freeze(pastDue)});
 }
 get(id:string){return this.invoices.get(id);}
 private require(id:string){const i=this.invoices.get(id);if(!i)throw new Error('MEMBERSHIP_INVOICE_NOT_FOUND');return i;}
 private replace(value:MembershipInvoice){const frozen=this.freeze(value);this.invoices.set(value.id,frozen);return frozen;}
 private freeze(value:MembershipInvoice):MembershipInvoice{return Object.freeze({...value,settlementReferences:Object.freeze([...value.settlementReferences])});}
}
