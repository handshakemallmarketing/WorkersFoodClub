import type {ParticipantId} from '../../kernel/src/index.js';

export type MembershipInvoiceState='ISSUED'|'DUE'|'PARTIALLY_SETTLED'|'SETTLED'|'PAST_DUE'|'VOID';
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
}
export interface MembershipStanding {readonly participantId:ParticipantId;readonly state:MembershipStandingState;readonly basisInvoiceIds:readonly string[];}

export class InMemoryMembershipBillingStore {
 private readonly invoices=new Map<string,MembershipInvoice>();
 issue(input:{id:string;participantId:ParticipantId;amountMinor:number;issuedAt:string;dueAt:string}):MembershipInvoice{
  if(this.invoices.has(input.id)) throw new Error('MEMBERSHIP_INVOICE_ID_DUPLICATE');
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) throw new Error('MEMBERSHIP_INVOICE_AMOUNT_INVALID');
  if(Date.parse(input.dueAt)<Date.parse(input.issuedAt)) throw new Error('MEMBERSHIP_INVOICE_DUE_INVALID');
  const invoice=this.freeze({...input,settledMinor:0,state:'ISSUED' as const,settlementReferences:[]});this.invoices.set(invoice.id,invoice);return invoice;
 }
 markDue(id:string):MembershipInvoice{const i=this.require(id);if(i.state!=='ISSUED')throw new Error('MEMBERSHIP_INVOICE_NOT_ISSUED');return this.replace({...i,state:'DUE'});}
 recordAuthoritativeSettlement(id:string,input:{amountMinor:number;reference:string}):MembershipInvoice{
  const i=this.require(id);if(i.state==='VOID'||i.state==='SETTLED')throw new Error('MEMBERSHIP_INVOICE_NOT_SETTLEABLE');
  if(!input.reference.trim())throw new Error('SETTLEMENT_REFERENCE_REQUIRED');
  if(i.settlementReferences.includes(input.reference))return i;
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0)throw new Error('SETTLEMENT_AMOUNT_INVALID');
  const settled=Math.min(i.amountMinor,i.settledMinor+input.amountMinor);
  const state:MembershipInvoiceState=settled===i.amountMinor?'SETTLED':'PARTIALLY_SETTLED';
  return this.replace({...i,settledMinor:settled,state,settlementReferences:[...i.settlementReferences,input.reference]});
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
