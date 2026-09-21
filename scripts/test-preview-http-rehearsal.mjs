import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

const rawBase=process.env.PREVIEW_BASE_URL?.replace(/\/$/,'');
const expectedSha=process.env.EXPECTED_COMMIT_SHA;
const expectedDatabaseHostSha256=process.env.EXPECTED_DATABASE_HOST_SHA256;
const trustedOidcToken=process.env.VERCEL_TRUSTED_OIDC_TOKEN;
if(!rawBase)throw new Error('PREVIEW_BASE_URL required');
if(!expectedSha)throw new Error('EXPECTED_COMMIT_SHA required');
if(!expectedDatabaseHostSha256)throw new Error('EXPECTED_DATABASE_HOST_SHA256 required');
assert.match(expectedSha,/^[0-9a-f]{40}$/,'EXPECTED_COMMIT_SHA must be a full 40-character Git SHA');
assert.match(expectedDatabaseHostSha256,/^[0-9a-f]{64}$/,'EXPECTED_DATABASE_HOST_SHA256 must be a lowercase SHA-256 digest');

const target=new URL(rawBase);
assert.equal(target.protocol,'https:','PREVIEW_BASE_URL must use https');
assert.equal(target.pathname,'/','PREVIEW_BASE_URL must be a deployment origin without a path');
assert.equal(target.search,'','PREVIEW_BASE_URL must not contain a query string');
assert.equal(target.hash,'','PREVIEW_BASE_URL must not contain a fragment');
assert.match(target.hostname,/^workers-food-club-[a-z0-9]+-origin-os\.vercel\.app$/,'PREVIEW_BASE_URL must be an immutable WorkersFoodClub deployment in the expected Vercel team');
const base=target.origin;

function deterministicRequestId(label){
  const bytes=Buffer.from(createHash('sha256').update(`${expectedSha}:${label}`).digest().subarray(0,16));
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function headers(extra={},bearer,useTrustedSource=true){
  const h={accept:'application/json',...extra};
  if(useTrustedSource&&trustedOidcToken)h['x-vercel-trusted-oidc-idp-token']=trustedOidcToken;
  if(bearer)h.authorization=`Bearer ${bearer}`;
  return h;
}
async function json(path,init={},bearer,useTrustedSource=true){
  const merged={...init,headers:headers(init.headers??{},bearer,useTrustedSource)};
  const r=await fetch(`${base}${path}`,merged);
  let body={};
  let text='';
  try{text=await r.text();body=text?JSON.parse(text):{};}catch{body={raw:text.slice(0,300)};}
  return {status:r.status,body};
}
async function post(path,payload,bearer){return json(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)},bearer);}

const edgeUnauthenticated=await json('/api/build-info',{},undefined,false);
assert.ok(edgeUnauthenticated.status===401||edgeUnauthenticated.status===403,`deployment protection must reject a request without trusted-source OIDC; received ${edgeUnauthenticated.status}`);

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

const databaseTarget=await json('/api/db-health?probe=database-target-fingerprint');
assert.equal(databaseTarget.status,200);
assert.equal(databaseTarget.body?.ok,true);
assert.equal(databaseTarget.body?.environment,'preview');
assert.equal(databaseTarget.body?.algorithm,'sha256');
assert.equal(databaseTarget.body?.hostSha256,expectedDatabaseHostSha256,'Preview deployment is not bound to the separately verified isolated database target');

const session=await json('/api/preview-session');
assert.equal(session.status,200);
assert.equal(session.body?.ok,true);
const memberToken=session.body?.memberToken;
const fulfillmentToken=session.body?.operatorTokens?.fulfillment;
const financeToken=session.body?.operatorTokens?.finance;
const adminToken=session.body?.operatorTokens?.admin;
for(const [name,token] of Object.entries({memberToken,fulfillmentToken,financeToken,adminToken})){
  assert.equal(typeof token,'string',`${name} must be minted by the exact Preview deployment`);
  assert.ok(token.length>40,`${name} must not be empty`);
}

const unauthenticatedSurvey=await post('/api/product-request-survey',{requestId:randomUUID(),subject:'unauthenticated-probe',preference:{interest:true}});
assert.equal(unauthenticatedSurvey.status,401,'survey must reject a missing application bearer');
const wrongRoleSurvey=await post('/api/product-request-survey',{requestId:randomUUID(),subject:'wrong-role-probe',preference:{interest:true}},adminToken);
assert.equal(wrongRoleSurvey.status,403,'operator token must not gain member survey authority');
const wrongRoleSupport=await post('/api/support-case',{requestId:randomUUID(),subjectType:'rehearsal',subjectId:'wrong-role',category:'AUTHORITY',reasonCode:'DENY',evidenceRefs:[]},financeToken);
assert.equal(wrongRoleSupport.status,403,'finance token must not gain Admin support authority');
const unauthenticatedSupport=await post('/api/support-case',{requestId:randomUUID(),subjectType:'rehearsal',subjectId:'missing-auth',category:'AUTHORITY',reasonCode:'DENY',evidenceRefs:[]});
assert.equal(unauthenticatedSupport.status,401,'support case must reject a missing application bearer');
const wrongRoleTransition=await post('/api/support-case-transition',{requestId:randomUUID(),caseId:'wfc:case:00000000-0000-4000-8000-000000000000',toState:'IN_REVIEW',expectedVersion:1,evidenceRefs:[]},memberToken);
assert.equal(wrongRoleTransition.status,403,'member token must not gain Admin support-transition authority');

const before=await json('/api/member-orders',{},memberToken);
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

const withheldPayment=await post('/api/pay-sandbox',{obligationId:'not-an-obligation',requestId:randomUUID()},memberToken);
assert.equal(withheldPayment.status,503,'payment must remain unavailable before payload processing');
assert.equal(withheldPayment.body?.error,'PREVIEW_PAYMENT_ATOMICITY_NOT_CERTIFIED');

const mutationPaths=[
  ['/api/fulfillment-ready',fulfillmentToken],
  ['/api/accept-fulfillment',memberToken],
  ['/api/authorize-refund',financeToken],
  ['/api/complete-refund',financeToken],
];
for(const [path,token] of mutationPaths){
  const r=await post(path,{obligationId:'not-an-obligation',requestId:randomUUID(),acceptedQuantity:999},token);
  assert.equal(r.status,400,`${path} malformed obligation must fail 400`);
}

const badReq=await post('/api/complete-refund',{obligationId,requestId:'not-a-uuid'},financeToken);
assert.equal(badReq.status,400);
assert.equal(badReq.body?.error,'REQUEST_ID_INVALID');

const payAttempt=await post('/api/pay-sandbox',{obligationId,requestId:randomUUID()},memberToken);
assert.equal(payAttempt.status,503);assert.equal(payAttempt.body?.error,'PREVIEW_PAYMENT_ATOMICITY_NOT_CERTIFIED');

const readyReplay=await post('/api/fulfillment-ready',{obligationId,requestId:randomUUID()},fulfillmentToken);
assert.equal(readyReplay.status,200);assert.equal(readyReplay.body?.fulfillment?.idempotent,true);assert.equal(readyReplay.body?.fulfillment?.readyEventId,stable.readyEventId);assert.equal(readyReplay.body?.fulfillment?.state,stable.fulfillmentState);

const acceptanceRegression=await post('/api/accept-fulfillment',{obligationId,acceptedQuantity:999,requestId:randomUUID()},memberToken);
assert.equal(acceptanceRegression.status,200);assert.equal(acceptanceRegression.body?.acceptance?.idempotent,true);assert.equal(acceptanceRegression.body?.acceptance?.state,stable.fulfillmentState);assert.equal(acceptanceRegression.body?.acceptance?.acceptedQuantity,order.fulfillment.acceptedQuantity);assert.equal(acceptanceRegression.body?.acceptance?.shortfallQuantity,order.fulfillment.shortfallQuantity);

const authReplay=await post('/api/authorize-refund',{obligationId,requestId:randomUUID()},financeToken);
assert.equal(authReplay.status,200);assert.equal(authReplay.body?.remedy?.idempotent,true);assert.equal(authReplay.body?.remedy?.authorizeEventId,stable.authorizeEventId);

const completeReplay=await post('/api/complete-refund',{obligationId,requestId:randomUUID()},financeToken);
assert.equal(completeReplay.status,200);assert.equal(completeReplay.body?.remedy?.idempotent,true);assert.equal(completeReplay.body?.remedy?.completionEventId,stable.completionEventId);assert.equal(completeReplay.body?.remedy?.providerReference,stable.providerReference);

const unknown=`preview:obligation:${randomUUID()}`;
const unknownComplete=await post('/api/complete-refund',{obligationId:unknown,requestId:randomUUID()},financeToken);
assert.equal(unknownComplete.status,409);assert.equal(unknownComplete.body?.error,'REFUND_NOT_AUTHORIZED');

const surveyRequestId=deterministicRequestId('uc14-survey');
const surveyPayload={requestId:surveyRequestId,subject:`rehearsal-${expectedSha.slice(0,12)}`,preference:{interest:true,source:'hosted-preview-rehearsal'}};
const surveyCreated=await post('/api/product-request-survey',surveyPayload,memberToken);
assert.ok(surveyCreated.status===200||surveyCreated.status===201);assert.equal(surveyCreated.body?.survey?.economicClassification,'NON_COMMITMENT');assert.equal(surveyCreated.body?.survey?.participantId,'preview:member:001');assert.equal(surveyCreated.body?.survey?.idempotent,surveyCreated.status===200);
const surveyReplay=await post('/api/product-request-survey',surveyPayload,memberToken);
assert.equal(surveyReplay.status,200);assert.equal(surveyReplay.body?.survey?.idempotent,true);assert.equal(surveyReplay.body?.survey?.surveyResponseId,surveyCreated.body?.survey?.surveyResponseId);
const surveyRebound=await post('/api/product-request-survey',{...surveyPayload,subject:'changed-subject'},memberToken);
assert.equal(surveyRebound.status,409);assert.equal(surveyRebound.body?.error,'SURVEY_REQUEST_REBOUND');

const supportRequestId=deterministicRequestId('uc28-support-case');
const supportPayload={requestId:supportRequestId,participantId:'preview:member:001',subjectType:'rehearsal',subjectId:obligationId,category:'FULFILLMENT',reasonCode:'HOSTED_PROOF',evidenceRefs:[stable.acceptanceEventId]};
const supportCreated=await post('/api/support-case',supportPayload,adminToken);
assert.ok(supportCreated.status===200||supportCreated.status===201);assert.equal(supportCreated.body?.case?.state,'OPEN');assert.equal(supportCreated.body?.case?.participantId,'preview:member:001');assert.equal(supportCreated.body?.case?.idempotent,supportCreated.status===200);
const supportReplay=await post('/api/support-case',supportPayload,adminToken);
assert.equal(supportReplay.status,200);assert.equal(supportReplay.body?.case?.idempotent,true);assert.equal(supportReplay.body?.case?.caseId,supportCreated.body?.case?.caseId);
const supportRebound=await post('/api/support-case',{...supportPayload,reasonCode:'CHANGED'},adminToken);
assert.equal(supportRebound.status,409);assert.equal(supportRebound.body?.error,'SUPPORT_CASE_REQUEST_REBOUND');
const transitionPayload={requestId:deterministicRequestId('uc28-support-transition'),caseId:supportCreated.body.case.caseId,toState:'IN_REVIEW',expectedVersion:1,evidenceRefs:[stable.acceptanceEventId]};
const transitionCreated=await post('/api/support-case-transition',transitionPayload,adminToken);
assert.ok(transitionCreated.status===200||transitionCreated.status===201);assert.equal(transitionCreated.body?.idempotent,transitionCreated.status===200);assert.equal(transitionCreated.body?.transition?.from_state,'OPEN');assert.equal(transitionCreated.body?.transition?.to_state,'IN_REVIEW');assert.equal(Number(transitionCreated.body?.transition?.state_version),2);assert.ok(transitionCreated.body?.transition?.transition_id);
const transitionReplay=await post('/api/support-case-transition',transitionPayload,adminToken);
assert.equal(transitionReplay.status,200);assert.equal(transitionReplay.body?.idempotent,true);assert.equal(transitionReplay.body?.transition?.transition_id,transitionCreated.body?.transition?.transition_id);assert.equal(transitionReplay.body?.transition?.to_state,'IN_REVIEW');assert.equal(Number(transitionReplay.body?.transition?.state_version),2);
const transitionRebound=await post('/api/support-case-transition',{...transitionPayload,toState:'WAITING'},adminToken);
assert.equal(transitionRebound.status,409);assert.equal(transitionRebound.body?.error,'SUPPORT_CASE_TRANSITION_REBOUND');
const staleTransition=await post('/api/support-case-transition',{...transitionPayload,requestId:deterministicRequestId('uc28-support-transition-stale'),toState:'WAITING'},adminToken);
assert.equal(staleTransition.status,409);assert.equal(staleTransition.body?.error,'SUPPORT_CASE_STALE_VERSION');

const after=await json('/api/member-orders',{},memberToken);
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
  authentication:{mode:'vercel-trusted-source-oidc-plus-scoped-application-bearers',deploymentProtectionWithoutOidcStatus:edgeUnauthenticated.status,roles:['member','fulfillment','finance','admin']},
  target:{origin:base,deploymentUrl:build.deploymentUrl,deploymentId:build.deploymentId,branchUrl:build.branchUrl??null},
  expectedCommitSha:expectedSha,
  runtimeCommitSha:build.commitSha,
  databaseTarget:{algorithm:databaseTarget.body.algorithm,hostSha256:databaseTarget.body.hostSha256},
  obligationId,
  attacks:['deployment-protection-without-oidc','missing-survey-auth','wrong-role-survey','missing-support-auth','wrong-role-support','wrong-role-support-transition','payment-withheld-before-payload','malformed-obligation','malformed-request-id','fulfillment-ready-replay','acceptance-regression','refund-authorization-replay','refund-completion-replay','unknown-refund-target','survey-replay','survey-rebound','support-replay','support-rebound','support-transition-replay','support-transition-rebound','support-transition-stale-version'],
  uc14:{surveyResponseId:surveyCreated.body.survey.surveyResponseId,economicClassification:surveyCreated.body.survey.economicClassification},
  uc28:{caseId:supportCreated.body.case.caseId,transitionId:transitionCreated.body.transition.transition_id},
  stable
},null,2));
