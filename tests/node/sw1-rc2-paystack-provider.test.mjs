import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {PaystackConfigurationGate,PaystackPaymentAdapter,PaystackWebhookVerifier} from '../../dist/packages/pilot-payments/src/paystack.js';

const jsonResponse=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const money=(minor,currency='GHS')=>Object.freeze({minor:BigInt(minor),currency});

function queueFetcher(responses,calls=[]){
 return async (url,init={})=>{calls.push({url:String(url),init});const next=responses.shift();if(!next) throw new Error('TEST_FETCH_QUEUE_EMPTY');return jsonResponse(next.body,next.status??200);};
}

test('Paystack live mode fails closed until live funds are explicitly authorized',()=>{
 const gate=new PaystackConfigurationGate();
 assert.throws(()=>gate.validate({environment:'live',secretKey:'sk_live_example'}),/PAYSTACK_LIVE_PAYMENTS_NOT_AUTHORIZED/);
 assert.throws(()=>gate.validate({environment:'test',secretKey:'sk_live_example'}),/PAYSTACK_TEST_KEY_REQUIRED/);
 const cfg=gate.validate({environment:'test',secretKey:'sk_test_example'});
 assert.equal(cfg.liveEnabled,false);
});

test('Paystack Ghana MoMo initiation binds reference, amount and provider but does not declare payment truth',async()=>{
 const calls=[];const fetcher=queueFetcher([{body:{status:true,data:{reference:'wfc-order-1',status:'pay_offline',display_text:'Approve on phone'}}}],calls);
 const adapter=new PaystackPaymentAdapter({environment:'test',secretKey:'sk_test_example'},fetcher);
 const receipt=await adapter.initiatePayment({reference:'wfc-order-1',email:'member@example.com',phone:'0551234567',mobileMoneyProvider:'mtn',amount:money(12500)});
 assert.equal(receipt.providerReference,'wfc-order-1');assert.equal(receipt.state,'PENDING_EXTERNAL_CONFIRMATION');
 const sent=JSON.parse(calls[0].init.body);assert.deepEqual(sent.mobile_money,{phone:'0551234567',provider:'mtn'});assert.equal(sent.amount,12500);assert.equal(sent.currency,'GHS');
 assert.equal(calls[0].init.headers.Authorization,'Bearer sk_test_example');
});

test('Paystack webhook verification requires the exact raw body HMAC-SHA512 before semantics are trusted',()=>{
 const secret='sk_test_webhook';const verifier=new PaystackWebhookVerifier(secret);
 const rawBody=JSON.stringify({event:'charge.success',data:{reference:'wfc-order-1',status:'success',amount:12500,currency:'GHS',paid_at:'2026-09-11T12:00:00Z'}});
 const signature=createHmac('sha512',secret).update(rawBody).digest('hex');
 const verified=verifier.verify({rawBody,signature});assert.equal(verified.status,'CONFIRMED');assert.equal(verified.amount.minor,12500n);
 assert.throws(()=>verifier.verify({rawBody:`${rawBody} `,signature}),/PAYMENT_WEBHOOK_SIGNATURE_INVALID/);
 assert.throws(()=>verifier.verify({rawBody,signature:'0'.repeat(128)}),/PAYMENT_WEBHOOK_SIGNATURE_INVALID/);
});

test('Paystack webhook rejects authenticated but unsupported events rather than guessing payment state',()=>{
 const secret='sk_test_webhook';const verifier=new PaystackWebhookVerifier(secret);
 const rawBody=JSON.stringify({event:'refund.processed',data:{reference:'wfc-order-1'}});const signature=createHmac('sha512',secret).update(rawBody).digest('hex');
 assert.throws(()=>verifier.verify({rawBody,signature}),/PAYSTACK_WEBHOOK_EVENT_NOT_SUPPORTED/);
});

test('Paystack transaction verification reconciles provider success and rejects nonterminal outcomes as canonical truth',async()=>{
 const fetcher=queueFetcher([
  {body:{status:true,data:{reference:'wfc-order-2',status:'pending',amount:5000,currency:'GHS',created_at:'2026-09-11T12:00:00Z'}}},
  {body:{status:true,data:{reference:'wfc-order-2',status:'success',amount:5000,currency:'GHS',paid_at:'2026-09-11T12:01:00Z'}}}
 ]);
 const adapter=new PaystackPaymentAdapter({environment:'test',secretKey:'sk_test_example'},fetcher);
 const pending=await adapter.verifyPayment('wfc-order-2');assert.equal(pending.state,'PENDING');assert.throws(()=>adapter.toVerifiedTerminal(pending),/PAYSTACK_OUTCOME_NOT_TERMINAL/);
 const success=await adapter.verifyPayment('wfc-order-2');const terminal=adapter.toVerifiedTerminal(success);assert.equal(terminal.status,'CONFIRMED');assert.equal(terminal.providerReference,'wfc-order-2');
});

test('Paystack verification rejects provider reference rebinding',async()=>{
 const fetcher=queueFetcher([{body:{status:true,data:{reference:'other-order',status:'success',amount:5000,currency:'GHS',paid_at:'2026-09-11T12:01:00Z'}}}]);
 const adapter=new PaystackPaymentAdapter({environment:'test',secretKey:'sk_test_example'},fetcher);
 await assert.rejects(()=>adapter.verifyPayment('wfc-order-3'),/PAYSTACK_VERIFY_REFERENCE_MISMATCH/);
});

test('Paystack refunds remain provider evidence with explicit lifecycle state and transaction binding',async()=>{
 const calls=[];const fetcher=queueFetcher([
  {body:{status:true,data:{id:77,status:'pending',transaction_reference:'wfc-order-4',amount:3000,currency:'GHS'}}},
  {body:{status:true,data:{id:77,status:'processed',transaction_reference:'wfc-order-4',amount:3000,currency:'GHS'}}}
 ],calls);
 const adapter=new PaystackPaymentAdapter({environment:'test',secretKey:'sk_test_example'},fetcher);
 const started=await adapter.initiateRefund({transactionReference:'wfc-order-4',amount:money(3000),merchantNote:'authorized-remedy:remedy-1'});assert.equal(started.state,'PENDING');assert.equal(started.refundId,'77');
 const queried=await adapter.queryRefund('77');assert.equal(queried.state,'PROCESSED');assert.equal(queried.transactionReference,'wfc-order-4');
 assert.equal(JSON.parse(calls[0].init.body).transaction,'wfc-order-4');
});

test('Paystack provider errors are fail-closed and do not echo credentials',async()=>{
 const secret='sk_test_super_sensitive';const fetcher=queueFetcher([{status:401,body:{status:false,message:`bad key ${secret}`}}]);
 const adapter=new PaystackPaymentAdapter({environment:'test',secretKey:secret},fetcher);
 await assert.rejects(()=>adapter.verifyPayment('wfc-order-5'),err=>{assert.equal(err.message,'PAYSTACK_PROVIDER_REQUEST_FAILED');assert.ok(!err.message.includes(secret));return true;});
});
