import {PaystackPaymentAdapter,type GhanaMobileMoneyProvider} from '../../pilot-payments/src/paystack.js';
import type {Money} from '../../kernel/src/index.js';

export type PaystackRehearsalAction='initiate'|'verify'|'refund'|'refund-status';

export interface PaystackRehearsalRuntime {
  readonly vercelEnv?:string;
  readonly secretKey?:string;
}

export interface PaystackRehearsalInput {
  readonly action:PaystackRehearsalAction;
  readonly reference?:string;
  readonly refundId?:string;
  readonly email?:string;
  readonly phone?:string;
  readonly mobileMoneyProvider?:GhanaMobileMoneyProvider;
  readonly amountMinor?:number;
  readonly merchantNote?:string;
}

const DEFAULT_TEST_EMAIL='rc2-paystack-test@example.com';
const DEFAULT_TEST_PHONE='0551234987';
const DEFAULT_AMOUNT_MINOR=100;
const REFERENCE_RE=/^wfc-rc2-[A-Za-z0-9-]{8,80}$/;
const REFUND_ID_RE=/^[A-Za-z0-9_-]{1,128}$/;

function requirePreview(runtime:PaystackRehearsalRuntime):string{
  if(runtime.vercelEnv!=='preview') throw new Error('PAYSTACK_REHEARSAL_PREVIEW_ONLY');
  const secret=runtime.secretKey??'';
  if(!secret.startsWith('sk_test_')) throw new Error('PAYSTACK_REHEARSAL_TEST_SECRET_REQUIRED');
  return secret;
}

function amount(minor:number|undefined):Money{
  const value=minor??DEFAULT_AMOUNT_MINOR;
  if(!Number.isSafeInteger(value)||value<=0||value>100000) throw new Error('PAYSTACK_REHEARSAL_AMOUNT_INVALID');
  return Object.freeze({minor:BigInt(value),currency:'GHS'});
}

function safeReference(value:string|undefined):string{
  if(!value||!REFERENCE_RE.test(value)) throw new Error('PAYSTACK_REHEARSAL_REFERENCE_INVALID');
  return value;
}

export async function executePaystackRehearsal(
  runtime:PaystackRehearsalRuntime,
  input:PaystackRehearsalInput,
  fetcher:typeof fetch=fetch
):Promise<Readonly<Record<string,unknown>>>{
  const secretKey=requirePreview(runtime);
  const adapter=new PaystackPaymentAdapter({secretKey,environment:'test',liveEnabled:false},fetcher);

  switch(input.action){
    case 'initiate':{
      const reference=safeReference(input.reference);
      const receipt=await adapter.initiatePayment({
        reference,
        email:input.email?.trim()||DEFAULT_TEST_EMAIL,
        phone:input.phone?.trim()||DEFAULT_TEST_PHONE,
        mobileMoneyProvider:input.mobileMoneyProvider??'mtn',
        amount:amount(input.amountMinor)
      });
      return Object.freeze({
        action:'initiate',provider:receipt.provider,reference:receipt.providerReference,
        rawStatus:receipt.rawStatus,state:receipt.state,
        ...(receipt.displayText?{displayText:receipt.displayText}:{})
      });
    }
    case 'verify':{
      const reference=safeReference(input.reference);
      const verification=await adapter.verifyPayment(reference);
      return Object.freeze({
        action:'verify',provider:verification.provider,reference:verification.providerReference,
        rawStatus:verification.rawStatus,state:verification.state,
        amountMinor:verification.amount.minor.toString(),currency:verification.amount.currency,
        occurredAt:verification.occurredAt
      });
    }
    case 'refund':{
      const reference=safeReference(input.reference);
      const receipt=await adapter.initiateRefund({
        transactionReference:reference,
        amount:amount(input.amountMinor),
        merchantNote:input.merchantNote?.trim()||'SW1-RC2 provider rehearsal refund'
      });
      return Object.freeze({
        action:'refund',provider:receipt.provider,reference:receipt.transactionReference,
        refundId:receipt.refundId,rawStatus:receipt.rawStatus,state:receipt.state,
        amountMinor:receipt.amount.minor.toString(),currency:receipt.amount.currency
      });
    }
    case 'refund-status':{
      const refundId=input.refundId??'';
      if(!REFUND_ID_RE.test(refundId)) throw new Error('PAYSTACK_REHEARSAL_REFUND_ID_INVALID');
      const receipt=await adapter.queryRefund(refundId);
      return Object.freeze({
        action:'refund-status',provider:receipt.provider,reference:receipt.transactionReference,
        refundId:receipt.refundId,rawStatus:receipt.rawStatus,state:receipt.state,
        amountMinor:receipt.amount.minor.toString(),currency:receipt.amount.currency
      });
    }
  }
}
