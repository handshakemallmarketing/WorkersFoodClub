import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const base=process.env.PREVIEW_BASE_URL?.replace(/\/$/,'');
const expectedSha=process.env.EXPECTED_COMMIT_SHA;
if(!base)throw new Error('PREVIEW_BASE_URL required');
if(!expectedSha)throw new Error('EXPECTED_COMMIT_SHA required');

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function json(path,init){const r=await fetch(`${base}${path}`,init);let body={};try{body=await r.json();}catch{}return {status:r.status,body};}
async function post(path,payload){return json(path,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload)});}

let build;
for(let i=0;i<30;i++){
  try{
    const r=await json('/api/build-info');
    if(r.status===200&&r.body?.ok===true&&r.body?.environment==='preview'){
      if(r.body?.commitSha&&r.body.commitSha!==expectedSha){
        await sleep(5000);
        continue;
      }
      build=r.body;
      break;
    }
  }catch{}
  await sleep(5000);
}
assert.ok(build,`preview runtime never became ready after exact-head Vercel status succeeded for ${expectedSha}`);
assert.equal(build.environment,'preview');
if(build.commitSha)assert.equal(build.commitSha,expectedSha);

const health=await json('/api/db-health');
assert.equal(health.status,200);
assert.equal(health.body?.ok,true);

const before=await json('/api/member-orders');
assert.equal(before.status,200);
const order=before.body.orders.find(o=>o.remedy?.status==='COMPLETED');
assert.ok(order,'completed remedy order required for rehearsal');
const obligationId=order.obligationId;
const stable={
  commitmentEventId:order.canonicalEventId,
  paymentEventId:order.payment?.canonicalEventId,
  readyEventId:order.fulfillment?.readyEventId,
  acceptanceEventId:order.fulfillment?.acceptanceEventId,
  authorizeEventId:order.remedy?.authorizeEventId,
  completionEventId:order.remedy?.completionEventId,
  providerReference:order.remedy?.providerReference,
  state:order.state,
  fulfillmentState:order.fulfillment?.state,
  remedyStatus:order.remedy?.status
};

for(const path of ['/api/pay-sandbox','/api/fulfillment-ready','/api/accept-fulfillment','/api/authorize-refund','/api/complete-refund']){
  const r=await post(path,{obligationId:'not-an-obligation',requestId:randomUUID(),acceptedQuantity:999});
  assert.equal(r.status,400,`${path} malformed obligation must fail 400`);
}

const badReq=await post('/api/complete-refund',{obligationId,requestId:'not-a-uuid'});
assert.equal(badReq.status,400);
assert.equal(badReq.body?.error,'REQUEST_ID_INVALID');

const payReplay=await post('/api/pay-sandbox',{obligationId,requestId:randomUUID()});
assert.equal(payReplay.status,200);
assert.equal(payReplay.body?.payment?.idempotent,true);
assert.equal(payReplay.body?.payment?.canonicalEventId,stable.paymentEventId);

const readyReplay=await post('/api/fulfillment-ready',{obligationId,requestId:randomUUID()});
assert.equal(readyReplay.status,200);
assert.equal(readyReplay.body?.fulfillment?.idempotent,true);
assert.equal(readyReplay.body?.fulfillment?.readyEventId,stable.readyEventId);
assert.equal(readyReplay.body?.fulfillment?.state,stable.fulfillmentState);

const acceptanceRegression=await post('/api/accept-fulfillment',{obligationId,acceptedQuantity:999,requestId:randomUUID()});
assert.equal(acceptanceRegression.status,200);
assert.equal(acceptanceRegression.body?.acceptance?.idempotent,true);
assert.equal(acceptanceRegression.body?.acceptance?.state,stable.fulfillmentState);
assert.equal(acceptanceRegression.body?.acceptance?.acceptedQuantity,order.fulfillment.acceptedQuantity);
assert.equal(acceptanceRegression.body?.acceptance?.shortfallQuantity,order.fulfillment.shortfallQuantity);

const authReplay=await post('/api/authorize-refund',{obligationId,requestId:randomUUID()});
assert.equal(authReplay.status,200);
assert.equal(authReplay.body?.remedy?.idempotent,true);
assert.equal(authReplay.body?.remedy?.authorizeEventId,stable.authorizeEventId);

const completeReplay=await post('/api/complete-refund',{obligationId,requestId:randomUUID()});
assert.equal(completeReplay.status,200);
assert.equal(completeReplay.body?.remedy?.idempotent,true);
assert.equal(completeReplay.body?.remedy?.completionEventId,stable.completionEventId);
assert.equal(completeReplay.body?.remedy?.providerReference,stable.providerReference);

const unknown=`preview:obligation:${randomUUID()}`;
const unknownComplete=await post('/api/complete-refund',{obligationId:unknown,requestId:randomUUID()});
assert.equal(unknownComplete.status,409);
assert.equal(unknownComplete.body?.error,'REFUND_NOT_AUTHORIZED');

const after=await json('/api/member-orders');
assert.equal(after.status,200);
const finalOrder=after.body.orders.find(o=>o.obligationId===obligationId);
assert.ok(finalOrder);
assert.deepEqual({
  commitmentEventId:finalOrder.canonicalEventId,
  paymentEventId:finalOrder.payment?.canonicalEventId,
  readyEventId:finalOrder.fulfillment?.readyEventId,
  acceptanceEventId:finalOrder.fulfillment?.acceptanceEventId,
  authorizeEventId:finalOrder.remedy?.authorizeEventId,
  completionEventId:finalOrder.remedy?.completionEventId,
  providerReference:finalOrder.remedy?.providerReference,
  state:finalOrder.state,
  fulfillmentState:finalOrder.fulfillment?.state,
  remedyStatus:finalOrder.remedy?.status
},stable);

console.log(JSON.stringify({ok:true,expectedCommitSha:expectedSha,runtimeCommitSha:build.commitSha??null,obligationId,attacks:['malformed-obligation','malformed-request-id','payment-replay','fulfillment-ready-replay','acceptance-regression','refund-authorization-replay','refund-completion-replay','unknown-refund-target'],stable},null,2));
