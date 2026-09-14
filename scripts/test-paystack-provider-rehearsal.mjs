import { spawnSync } from 'node:child_process';
import { mintPreviewApiToken } from '../lib/preview-api-auth.js';

const base=(process.env.PREVIEW_BASE_URL??'').trim().replace(/\/$/,'');
const expectedSha=(process.env.EXPECTED_COMMIT_SHA??'').trim();
const previewAuthSecret=process.env.PREVIEW_API_AUTH_SECRET??'';
const vercelToken=process.env.VERCEL_TOKEN??'';
const vercelScope=(process.env.VERCEL_SCOPE??'food-club').trim();
if(!/^https:\/\//.test(base)) throw new Error('PREVIEW_BASE_URL_REQUIRED');
if(!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXPECTED_COMMIT_SHA_INVALID');
if(previewAuthSecret.length<32) throw new Error('PREVIEW_API_AUTH_SECRET_REQUIRED');
if(!vercelToken) throw new Error('VERCEL_TOKEN_REQUIRED');
if(!vercelScope) throw new Error('VERCEL_SCOPE_REQUIRED');

const now=Math.floor(Date.now()/1000);
const previewOperatorToken=mintPreviewApiToken({
  secret:previewAuthSecret,
  subject:'github-actions:paystack-provider-rehearsal',
  actorId:'preview:operator:001',
  scopes:['operator:payment.rehearse'],
  issuedAt:now,
  expiresAt:now+(10*60),
});

function sanitize(value=''){
  return String(value)
    .replaceAll(vercelToken,'[REDACTED_VERCEL_TOKEN]')
    .replaceAll(previewOperatorToken,'[REDACTED_PREVIEW_TOKEN]')
    .slice(0,1200);
}

function json(path,init={}){
  const method=String(init.method??'GET').toUpperCase();
  const curlArgs=['--silent','--show-error','--fail-with-body'];
  if(method!=='GET') curlArgs.push('--request',method);
  curlArgs.push('--header','Accept: application/json');
  if(path==='/api/paystack-rehearsal'){
    curlArgs.push('--header','Content-Type: application/json');
    curlArgs.push('--header',`Authorization: Bearer ${previewOperatorToken}`);
  }
  if(init.body!==undefined) curlArgs.push('--data-raw',String(init.body));

  const result=spawnSync('vercel',[
    'curl',path,
    '--deployment',base,
    '--scope',vercelScope,
    '--',
    ...curlArgs,
  ],{
    encoding:'utf8',
    env:{...process.env,VERCEL_TOKEN:vercelToken},
    maxBuffer:1024*1024,
  });

  if(result.error){
    throw new Error(`VERCEL_CURL_EXECUTION_FAILED:${sanitize(result.error.message)}`);
  }

  const text=String(result.stdout??'').trim();
  let body;
  try{body=JSON.parse(text);}catch{body={raw:sanitize(text)}}

  if(result.status!==0){
    const detail=sanitize(result.stderr||text||`exit=${result.status}`);
    throw new Error(`${path} VERCEL_CURL_FAILED:${detail}`);
  }
  return body;
}

const build=json('/api/build-info',{method:'GET'});
const runtimeSha=String(build?.commitSha??build?.gitCommitSha??build?.sha??'');
if(runtimeSha!==expectedSha) throw new Error(`EXACT_HEAD_MISMATCH expected=${expectedSha} actual=${runtimeSha||'missing'}`);

const startedAt=new Date().toISOString();
const initiation=json('/api/paystack-rehearsal',{method:'POST',body:JSON.stringify({action:'initiate'})});
if(initiation?.ok!==true||initiation?.rehearsal?.provider!=='PAYSTACK') throw new Error('PAYSTACK_INITIATION_EVIDENCE_INVALID');
const reference=String(initiation.rehearsal.reference??'');
if(!/^wfc-rc2-[A-Za-z0-9-]{8,80}$/.test(reference)) throw new Error('PAYSTACK_REFERENCE_INVALID');

const verificationAttempts=[];
for(let attempt=1;attempt<=6;attempt+=1){
  if(attempt>1) await new Promise(resolve=>setTimeout(resolve,5000));
  const verification=json('/api/paystack-rehearsal',{method:'POST',body:JSON.stringify({action:'verify',reference})});
  verificationAttempts.push({attempt,observedAt:new Date().toISOString(),...verification});
  const state=verification?.rehearsal?.state;
  if(state==='CONFIRMED'||state==='FAILED'||state==='REVERSED') break;
}

const finalVerification=verificationAttempts.at(-1);
if(!finalVerification?.ok||finalVerification?.rehearsal?.provider!=='PAYSTACK') throw new Error('PAYSTACK_VERIFICATION_EVIDENCE_INVALID');
if(finalVerification?.rehearsal?.state!=='CONFIRMED') throw new Error(`PAYSTACK_PROVIDER_NOT_CONFIRMED:${finalVerification?.rehearsal?.state??'missing'}`);

const delayedRequeryStartedAt=new Date().toISOString();
await new Promise(resolve=>setTimeout(resolve,2000));
const delayedRequery=json('/api/paystack-rehearsal',{method:'POST',body:JSON.stringify({action:'verify',reference})});
if(delayedRequery?.ok!==true||delayedRequery?.rehearsal?.state!=='CONFIRMED'||delayedRequery?.rehearsal?.reference!==reference) throw new Error('PAYSTACK_DELAYED_REQUERY_EVIDENCE_INVALID');

const refund=json('/api/paystack-rehearsal',{method:'POST',body:JSON.stringify({action:'refund',reference})});
if(refund?.ok!==true||refund?.rehearsal?.provider!=='PAYSTACK'||refund?.rehearsal?.reference!==reference) throw new Error('PAYSTACK_REFUND_EVIDENCE_INVALID');
const refundId=String(refund?.rehearsal?.refundId??'');
if(!/^[A-Za-z0-9_-]{1,128}$/.test(refundId)) throw new Error('PAYSTACK_REFUND_ID_INVALID');

const refundStatusAttempts=[];
for(let attempt=1;attempt<=6;attempt+=1){
  if(attempt>1) await new Promise(resolve=>setTimeout(resolve,5000));
  const status=json('/api/paystack-rehearsal',{method:'POST',body:JSON.stringify({action:'refund-status',refundId})});
  refundStatusAttempts.push({attempt,observedAt:new Date().toISOString(),...status});
  const state=status?.rehearsal?.state;
  if(state==='PROCESSED'||state==='FAILED'||state==='NEEDS_ATTENTION') break;
}

const finalRefundStatus=refundStatusAttempts.at(-1);
if(!finalRefundStatus?.ok||finalRefundStatus?.rehearsal?.provider!=='PAYSTACK'||finalRefundStatus?.rehearsal?.refundId!==refundId) throw new Error('PAYSTACK_REFUND_STATUS_EVIDENCE_INVALID');

console.log(JSON.stringify({
  rehearsal:'SW1-RC2-PAYSTACK-REAL-PROVIDER',
  expectedCommitSha:expectedSha,
  runtimeCommitSha:runtimeSha,
  previewBaseUrl:base,
  startedAt,
  completedAt:new Date().toISOString(),
  initiation,
  verificationAttempts,
  delayedRequery:{startedAt:delayedRequeryStartedAt,observedAt:new Date().toISOString(),...delayedRequery},
  refund,
  refundStatusAttempts,
  deploymentProtectionTransport:'AUTHENTICATED_VERCEL_CLI',
  applicationAuth:'BOUNDED_PREVIEW_OPERATOR_TOKEN',
  liveFundsAuthorized:false,
  secretExposed:false
},null,2));
