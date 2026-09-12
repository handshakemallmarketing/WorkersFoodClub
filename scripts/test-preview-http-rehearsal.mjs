import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const rawBase=process.env.PREVIEW_BASE_URL?.replace(/\/$/,'');
const expectedSha=process.env.EXPECTED_COMMIT_SHA;
const trustedOidcToken=process.env.VERCEL_TRUSTED_OIDC_TOKEN;
if(!rawBase)throw new Error('PREVIEW_BASE_URL required');
if(!expectedSha)throw new Error('EXPECTED_COMMIT_SHA required');
assert.match(expectedSha,/^[0-9a-f]{40}$/,'EXPECTED_COMMIT_SHA must be a full 40-character Git SHA');

const target=new URL(rawBase);
assert.equal(target.protocol,'https:','PREVIEW_BASE_URL must use https');
assert.equal(target.pathname,'/','PREVIEW_BASE_URL must be a deployment origin without a path');
assert.equal(target.search,'','PREVIEW_BASE_URL must not contain a query string');
assert.equal(target.hash,'','PREVIEW_BASE_URL must not contain a fragment');
const base=target.origin;

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function headers(extra={}){
  const h={accept:'application/json',...extra};
  if(trustedOidcToken)h['x-vercel-trusted-oidc-idp-token']=trustedOidcToken;
  return h;
}
async function json(path,init={}){
  const merged={...init,headers:headers(init.headers??{})};
  const r=await fetch(`${base}${path}`,merged);
  let body={};
  let text='';
  try{text=await r.text();body=text?JSON.parse(text):{};}catch{body={raw:text.slice(0,300)};}
  return {status:r.status,body};
}
async function post(path,payload){return json(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});}

let build;
let lastProbe;
for(let i=0;i<30;i++){
  try{
    const r=await json('/api/build-info');
    lastProbe=r;
    if(r.status===200&&r.body?.ok===true&&r.body?.environment==='preview'){
      if(r.body?.commitSha!==expectedSha){await sleep(5000);continue;}
      if(r.body?.deploymentUrl!==target.host){
        throw new Error(`PREVIEW_BASE_URL is not the immutable VERCEL_URL for this deployment: supplied=${target.host} runtime=${r.body?.deploymentUrl??null}`);
      }
      build=r.body;
      break;
    }
    if((r.status===401||r.status===403)&&!trustedOidcToken){
      throw new Error(`preview is protected by Vercel authentication (HTTP ${r.status}); GitHub Actions OIDC token is missing`);
    }
    if((r.status===401||r.status===403)&&trustedOidcToken){
      throw new Error(`Vercel rejected the GitHub Actions trusted-source OIDC token (HTTP ${r.status}); response=${JSON.stringify(r.body??null)}`);
    }
  }catch(error){
    if(error?.message?.includes('protected by Vercel authentication')||error?.message?.includes('rejected the GitHub Actions trusted-source OIDC token')||error?.message?.includes('not the immutable VERCEL_URL'))throw error;
  }
  await sleep(5000);
}
assert.ok(build,`preview runtime never became ready for ${expectedSha}; last probe=${JSON.stringify(lastProbe??null)}`);
assert.equal(build.environment,'preview');
assert.equal(build.commitSha,expectedSha,'runtime commit SHA must be present and exact');
assert.equal(build.deploymentUrl,target.host,'target host must equal immutable runtime VERCEL_URL');
assert.match(build.deploymentId??'',/^dpl_[A-Za-z0-9]+$/,'runtime VERCEL_DEPLOYMENT_ID must be present');

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
  exceptionEventId:order.fulfillment?.exceptionEventId,
  authorizeEventId:order.remedy?.authorizeEventId,
  completionEventId:order.remedy?.completionEventId,
  providerReference:order.remedy?.providerReference,
  state:order.state,
  fulfillmentState:order.fulfillment?.state,
  remedyStatus:order.remedy?.status
};
for(const [key,value] of Object.entries(stable))assert.ok(value!==null&&value!==undefined&&value!=='',`stable ${key} must be present before attack`);
assert.equal(stable.state,'FULFILLED');
assert.equal(stable.remedyStatus,'COMPLETED');

const mutationPaths=['/api/pay-sandbox','/api/fulfillment-ready','/api/accept-fulfillment','/api/authorize-refund','/api/complete-refund'];
for(const path of mutationPaths){
  const r=await post(path,{obligationId:'not-an-obligation',requestId:randomUUID(),acceptedQuantity:999});
  assert.equal(r.status,400,`${path} malformed obligation must fail 400`);
}

const badReq=await post('/api/complete-refund',{obligationId,requestId:'not-a-uuid'});
assert.equal(badReq.status,400);
assert.equal(badReq.body?.error,'REQUEST_ID_INVALID');

const payReplay=await post('/api/pay-sandbox',{obligationId,requestId:randomUUID()});
assert.equal(payReplay.status,200);assert.equal(payReplay.body?.payment?.idempotent,true);assert.equal(payReplay.body?.payment?.canonicalEventId,stable.paymentEventId);

const readyReplay=await post('/api/fulfillment-ready',{obligationId,requestId:randomUUID()});
assert.equal(readyReplay.status,200);assert.equal(readyReplay.body?.fulfillment?.idempotent,true);assert.equal(readyReplay.body?.fulfillment?.readyEventId,stable.readyEventId);assert.equal(readyReplay.body?.fulfillment?.state,stable.fulfillmentState);

const acceptanceRegression=await post('/api/accept-fulfillment',{obligationId,acceptedQuantity:999,requestId:randomUUID()});
assert.equal(acceptanceRegression.status,200);assert.equal(acceptanceRegression.body?.acceptance?.idempotent,true);assert.equal(acceptanceRegression.body?.acceptance?.state,stable.fulfillmentState);assert.equal(acceptanceRegression.body?.acceptance?.acceptedQuantity,order.fulfillment.acceptedQuantity);assert.equal(acceptanceRegression.body?.acceptance?.shortfallQuantity,order.fulfillment.shortfallQuantity);

const authReplay=await post('/api/authorize-refund',{obligationId,requestId:randomUUID()});
assert.equal(authReplay.status,200);assert.equal(authReplay.body?.remedy?.idempotent,true);assert.equal(authReplay.body?.remedy?.authorizeEventId,stable.authorizeEventId);

const completeReplay=await post('/api/complete-refund',{obligationId,requestId:randomUUID()});
assert.equal(completeReplay.status,200);assert.equal(completeReplay.body?.remedy?.idempotent,true);assert.equal(completeReplay.body?.remedy?.completionEventId,stable.completionEventId);assert.equal(completeReplay.body?.remedy?.providerReference,stable.providerReference);

const unknown=`preview:obligation:${randomUUID()}`;
const unknownComplete=await post('/api/complete-refund',{obligationId:unknown,requestId:randomUUID()});
assert.equal(unknownComplete.status,409);assert.equal(unknownComplete.body?.error,'REFUND_NOT_AUTHORIZED');

const after=await json('/api/member-orders');
assert.equal(after.status,200);
const finalOrder=after.body.orders.find(o=>o.obligationId===obligationId);
assert.ok(finalOrder);
const finalStable={
  commitmentEventId:finalOrder.canonicalEventId,
  paymentEventId:finalOrder.payment?.canonicalEventId,
  readyEventId:finalOrder.fulfillment?.readyEventId,
  acceptanceEventId:finalOrder.fulfillment?.acceptanceEventId,
  exceptionEventId:finalOrder.fulfillment?.exceptionEventId,
  authorizeEventId:finalOrder.remedy?.authorizeEventId,
  completionEventId:finalOrder.remedy?.completionEventId,
  providerReference:finalOrder.remedy?.providerReference,
  state:finalOrder.state,
  fulfillmentState:finalOrder.fulfillment?.state,
  remedyStatus:finalOrder.remedy?.status
};
assert.deepEqual(finalStable,stable);

console.log(JSON.stringify({
  ok:true,
  authentication:{mode:'vercel-trusted-source-oidc'},
  target:{origin:base,deploymentUrl:build.deploymentUrl,deploymentId:build.deploymentId,branchUrl:build.branchUrl??null},
  expectedCommitSha:expectedSha,
  runtimeCommitSha:build.commitSha,
  obligationId,
  attacks:['malformed-obligation','malformed-request-id','payment-replay','fulfillment-ready-replay','acceptance-regression','refund-authorization-replay','refund-completion-replay','unknown-refund-target'],
  stable
},null,2));
