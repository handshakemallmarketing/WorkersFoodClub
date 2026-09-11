import test from 'node:test';
import assert from 'node:assert/strict';
import {executePaystackRehearsal} from '../../dist/packages/paystack-rehearsal/src/index.js';

const runtime={vercelEnv:'preview',secretKey:'sk_test_example'};
const reference='wfc-rc2-12345678-abcd-4abc-8abc-1234567890ab';

function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}

test('RC2-PAY-001 rehearsal is preview-only and requires a test secret',async()=>{
 await assert.rejects(()=>executePaystackRehearsal({vercelEnv:'production',secretKey:'sk_test_example'},{action:'initiate',reference}),/PAYSTACK_REHEARSAL_PREVIEW_ONLY/);
 await assert.rejects(()=>executePaystackRehearsal({vercelEnv:'preview',secretKey:'sk_live_example'},{action:'initiate',reference}),/PAYSTACK_REHEARSAL_TEST_SECRET_REQUIRED/);
 await assert.rejects(()=>executePaystackRehearsal({vercelEnv:'preview'},{action:'initiate',reference}),/PAYSTACK_REHEARSAL_TEST_SECRET_REQUIRED/);
});

test('real-provider rehearsal initiation is bounded to Ghana test-mode MoMo and sanitizes credentials',async()=>{
 let seen;
 const fakeFetch=async(input,init)=>{
  seen={input:String(input),init};
  return jsonResponse({status:true,data:{reference,status:'pay_offline',display_text:'Complete on test handset'}});
 };
 const out=await executePaystackRehearsal(runtime,{action:'initiate',reference},fakeFetch);
 assert.equal(seen.input,'https://api.paystack.co/charge');
 assert.equal(seen.init.method,'POST');
 assert.equal(seen.init.headers.Authorization,'Bearer sk_test_example');
 const body=JSON.parse(seen.init.body);
 assert.equal(body.reference,reference);
 assert.equal(body.currency,'GHS');
 assert.equal(body.amount,100);
 assert.deepEqual(body.mobile_money,{phone:'0551234987',provider:'mtn'});
 assert.deepEqual(out,{action:'initiate',provider:'PAYSTACK',reference,rawStatus:'pay_offline',state:'PENDING_EXTERNAL_CONFIRMATION',displayText:'Complete on test handset'});
 assert.equal(JSON.stringify(out).includes('sk_test_example'),false);
});

test('rehearsal verification binds exact reference and normalizes provider truth without secret leakage',async()=>{
 const fakeFetch=async(input,init)=>{
  assert.equal(String(input),`https://api.paystack.co/transaction/verify/${reference}`);
  assert.equal(init.headers.Authorization,'Bearer sk_test_example');
  return jsonResponse({status:true,data:{reference,status:'success',amount:100,currency:'GHS',paid_at:'2026-09-11T21:00:00Z'}});
 };
 const out=await executePaystackRehearsal(runtime,{action:'verify',reference},fakeFetch);
 assert.deepEqual(out,{action:'verify',provider:'PAYSTACK',reference,rawStatus:'success',state:'CONFIRMED',amountMinor:'100',currency:'GHS',occurredAt:'2026-09-11T21:00:00Z'});
 assert.equal(JSON.stringify(out).includes('sk_test_example'),false);
});

test('rehearsal rejects unscoped references and unsafe amounts before provider access',async()=>{
 let called=false;const fakeFetch=async()=>{called=true;throw new Error('should not call');};
 await assert.rejects(()=>executePaystackRehearsal(runtime,{action:'verify',reference:'other-ref'},fakeFetch),/PAYSTACK_REHEARSAL_REFERENCE_INVALID/);
 await assert.rejects(()=>executePaystackRehearsal(runtime,{action:'initiate',reference,amountMinor:100001},fakeFetch),/PAYSTACK_REHEARSAL_AMOUNT_INVALID/);
 assert.equal(called,false);
});
