import {createHmac,timingSafeEqual} from 'node:crypto';
import type {Money} from '../../kernel/src/index.js';
import type {PaymentWebhookVerifier,VerifiedProviderWebhook} from './index.js';

export type PaystackEnvironment='test'|'live';
export type GhanaMobileMoneyProvider='mtn'|'atl'|'vod';
export type PaystackPaymentState='PENDING'|'CONFIRMED'|'FAILED'|'REVERSED'|'AMBIGUOUS';
export type PaystackRefundState='PENDING'|'PROCESSING'|'NEEDS_ATTENTION'|'PROCESSED'|'FAILED'|'AMBIGUOUS';
export interface PaystackConfiguration {readonly secretKey:string;readonly environment:PaystackEnvironment;readonly liveEnabled?:boolean;readonly baseUrl?:string;}
export interface PaystackChargeRequest {readonly reference:string;readonly email:string;readonly phone:string;readonly mobileMoneyProvider:GhanaMobileMoneyProvider;readonly amount:Money;}
export interface PaystackChargeReceipt {readonly provider:'PAYSTACK';readonly providerReference:string;readonly rawStatus:string;readonly state:'PENDING_EXTERNAL_CONFIRMATION';readonly displayText?:string;}
export interface PaystackVerification {readonly provider:'PAYSTACK';readonly providerReference:string;readonly rawStatus:string;readonly state:PaystackPaymentState;readonly amount:Money;readonly occurredAt:string;}
export interface PaystackRefundReceipt {readonly provider:'PAYSTACK';readonly transactionReference:string;readonly refundId:string;readonly rawStatus:string;readonly state:PaystackRefundState;readonly amount:Money;}

type FetchLike=(input:string|URL|Request,init?:RequestInit)=>Promise<Response>;
const PAYSTACK='PAYSTACK';
const nonBlank=(v:string)=>typeof v==='string'&&v.trim().length>0;
const validTime=(v:string)=>{if(!nonBlank(v)||Number.isNaN(Date.parse(v))) throw new Error('PAYSTACK_TIME_INVALID');return v;};
const parseMinor=(v:unknown):bigint=>{
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||v<0) throw new Error('PAYSTACK_AMOUNT_INVALID');return BigInt(v);}
 if(typeof v==='string'&&/^\d+$/.test(v)) return BigInt(v);
 throw new Error('PAYSTACK_AMOUNT_INVALID');
};
const parseMoney=(amount:unknown,currency:unknown):Money=>{
 if(currency!=='GHS'&&currency!=='USD') throw new Error('PAYSTACK_CURRENCY_INVALID');
 return Object.freeze({minor:parseMinor(amount),currency});
};
const requireObject=(v:unknown):Record<string,any>=>{if(!v||typeof v!=='object'||Array.isArray(v)) throw new Error('PAYSTACK_RESPONSE_INVALID');return v as Record<string,any>;};
const paymentState=(status:string):PaystackPaymentState=>{
 switch(status){case 'success':return 'CONFIRMED';case 'failed':case 'abandoned':return 'FAILED';case 'reversed':return 'REVERSED';case 'pending':case 'ongoing':case 'processing':case 'queued':return 'PENDING';default:return 'AMBIGUOUS';}
};
const refundState=(status:string):PaystackRefundState=>{
 switch(status){case 'pending':return 'PENDING';case 'processing':return 'PROCESSING';case 'needs-attention':return 'NEEDS_ATTENTION';case 'processed':return 'PROCESSED';case 'failed':return 'FAILED';default:return 'AMBIGUOUS';}
};

export class PaystackConfigurationGate{
 validate(input:PaystackConfiguration):Readonly<Required<Pick<PaystackConfiguration,'secretKey'|'environment'|'liveEnabled'|'baseUrl'>>>{
  if(!nonBlank(input.secretKey)) throw new Error('PAYSTACK_SECRET_KEY_REQUIRED');
  if(input.environment!=='test'&&input.environment!=='live') throw new Error('PAYSTACK_ENVIRONMENT_INVALID');
  const liveEnabled=input.liveEnabled===true;
  if(input.environment==='live'&&!liveEnabled) throw new Error('PAYSTACK_LIVE_PAYMENTS_NOT_AUTHORIZED');
  if(input.environment==='test'&&!input.secretKey.startsWith('sk_test_')) throw new Error('PAYSTACK_TEST_KEY_REQUIRED');
  if(input.environment==='live'&&!input.secretKey.startsWith('sk_live_')) throw new Error('PAYSTACK_LIVE_KEY_REQUIRED');
  const baseUrl=(input.baseUrl??'https://api.paystack.co').replace(/\/$/,'');
  if(!/^https:\/\//.test(baseUrl)) throw new Error('PAYSTACK_HTTPS_REQUIRED');
  return Object.freeze({secretKey:input.secretKey,environment:input.environment,liveEnabled,baseUrl});
 }
}

export class PaystackPaymentAdapter{
 private readonly cfg:Readonly<Required<Pick<PaystackConfiguration,'secretKey'|'environment'|'liveEnabled'|'baseUrl'>>>;
 constructor(config:PaystackConfiguration,private readonly fetcher:FetchLike=fetch){this.cfg=new PaystackConfigurationGate().validate(config);}
 private async request(path:string,init:RequestInit={}):Promise<Record<string,any>>{
  const response=await this.fetcher(`${this.cfg.baseUrl}${path}`,{...init,headers:{Authorization:`Bearer ${this.cfg.secretKey}`,'Content-Type':'application/json',...(init.headers??{})}});
  let body:unknown;try{body=await response.json();}catch{throw new Error('PAYSTACK_RESPONSE_INVALID');}
  const obj=requireObject(body);
  if(!response.ok||obj.status!==true) throw new Error('PAYSTACK_PROVIDER_REQUEST_FAILED');
  return obj;
 }
 async initiatePayment(input:PaystackChargeRequest):Promise<PaystackChargeReceipt>{
  if(!nonBlank(input.reference)||!nonBlank(input.email)||!nonBlank(input.phone)) throw new Error('PAYSTACK_CHARGE_BINDING_REQUIRED');
  if(input.amount.currency!=='GHS'||input.amount.minor<=0n||input.amount.minor>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('PAYSTACK_GHANA_AMOUNT_INVALID');
  const body={reference:input.reference,email:input.email,amount:Number(input.amount.minor),currency:'GHS',mobile_money:{phone:input.phone,provider:input.mobileMoneyProvider}};
  const obj=await this.request('/charge',{method:'POST',body:JSON.stringify(body)});const data=requireObject(obj.data);
  if(data.reference!==input.reference||typeof data.status!=='string') throw new Error('PAYSTACK_CHARGE_REFERENCE_MISMATCH');
  return Object.freeze({provider:PAYSTACK,providerReference:data.reference,rawStatus:data.status,state:'PENDING_EXTERNAL_CONFIRMATION' as const,...(typeof data.display_text==='string'?{displayText:data.display_text}: {})});
 }
 async verifyPayment(reference:string):Promise<PaystackVerification>{
  if(!nonBlank(reference)) throw new Error('PAYSTACK_REFERENCE_REQUIRED');
  const obj=await this.request(`/transaction/verify/${encodeURIComponent(reference)}`,{method:'GET'});const data=requireObject(obj.data);
  if(data.reference!==reference||typeof data.status!=='string') throw new Error('PAYSTACK_VERIFY_REFERENCE_MISMATCH');
  const occurredAt=validTime(String(data.paid_at??data.updated_at??data.created_at??''));
  return Object.freeze({provider:PAYSTACK,providerReference:reference,rawStatus:data.status,state:paymentState(data.status),amount:parseMoney(data.amount,data.currency),occurredAt});
 }
 async initiateRefund(input:{transactionReference:string;amount:Money;merchantNote:string}):Promise<PaystackRefundReceipt>{
  if(!nonBlank(input.transactionReference)||!nonBlank(input.merchantNote)) throw new Error('PAYSTACK_REFUND_BINDING_REQUIRED');
  if(input.amount.minor<=0n||input.amount.minor>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('PAYSTACK_REFUND_AMOUNT_INVALID');
  const obj=await this.request('/refund',{method:'POST',body:JSON.stringify({transaction:input.transactionReference,amount:Number(input.amount.minor),currency:input.amount.currency,merchant_note:input.merchantNote})});const data=requireObject(obj.data);
  const refundId=String(data.id??'');if(!nonBlank(refundId)||typeof data.status!=='string') throw new Error('PAYSTACK_REFUND_RESPONSE_INVALID');
  const txRef=String(data.transaction_reference??data.transaction?.reference??input.transactionReference);if(txRef!==input.transactionReference) throw new Error('PAYSTACK_REFUND_TRANSACTION_MISMATCH');
  return Object.freeze({provider:PAYSTACK,transactionReference:txRef,refundId,rawStatus:data.status,state:refundState(data.status),amount:parseMoney(data.amount,input.amount.currency)});
 }
 async queryRefund(refundId:string):Promise<PaystackRefundReceipt>{
  if(!nonBlank(refundId)) throw new Error('PAYSTACK_REFUND_ID_REQUIRED');
  const obj=await this.request(`/refund/${encodeURIComponent(refundId)}`,{method:'GET'});const data=requireObject(obj.data);
  if(String(data.id)!==refundId||typeof data.status!=='string') throw new Error('PAYSTACK_REFUND_ID_MISMATCH');
  const txRef=String(data.transaction_reference??data.transaction?.reference??data.transaction??'');if(!nonBlank(txRef)) throw new Error('PAYSTACK_REFUND_TRANSACTION_MISSING');
  return Object.freeze({provider:PAYSTACK,transactionReference:txRef,refundId,rawStatus:data.status,state:refundState(data.status),amount:parseMoney(data.amount,data.currency)});
 }
 toVerifiedTerminal(result:PaystackVerification):VerifiedProviderWebhook{
  if(result.state!=='CONFIRMED'&&result.state!=='FAILED') throw new Error('PAYSTACK_OUTCOME_NOT_TERMINAL');
  return Object.freeze({providerReference:result.providerReference,rawStatus:result.rawStatus,status:result.state,statusMappingVersion:'paystack-transaction-v1',amount:result.amount,occurredAt:result.occurredAt});
 }
}

export class PaystackWebhookVerifier implements PaymentWebhookVerifier{
 constructor(private readonly secretKey:string){if(!nonBlank(secretKey)) throw new Error('PAYSTACK_SECRET_KEY_REQUIRED');}
 verify(input:{rawBody:string;signature:string}):VerifiedProviderWebhook{
  if(!/^[a-fA-F0-9]{128}$/.test(input.signature)) throw new Error('PAYMENT_WEBHOOK_SIGNATURE_INVALID');
  const expected=createHmac('sha512',this.secretKey).update(input.rawBody).digest();const supplied=Buffer.from(input.signature,'hex');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)) throw new Error('PAYMENT_WEBHOOK_SIGNATURE_INVALID');
  let parsed:any;try{parsed=JSON.parse(input.rawBody);}catch{throw new Error('PAYMENT_WEBHOOK_BODY_INVALID');}
  if(parsed?.event!=='charge.success') throw new Error('PAYSTACK_WEBHOOK_EVENT_NOT_SUPPORTED');
  const data=requireObject(parsed.data);if(data.status!=='success'||!nonBlank(String(data.reference??''))) throw new Error('PAYMENT_WEBHOOK_BODY_INVALID');
  const occurredAt=validTime(String(data.paid_at??data.paidAt??data.updated_at??data.created_at??''));
  return Object.freeze({providerReference:String(data.reference),rawStatus:String(data.status),status:'CONFIRMED',statusMappingVersion:'paystack-charge-success-v1',amount:parseMoney(data.amount,data.currency),occurredAt});
 }
}
