const base=(process.env.PREVIEW_BASE_URL??'').replace(/\/$/,'');
const expectedSha=process.env.EXPECTED_COMMIT_SHA??'';
const oidc=process.env.VERCEL_TRUSTED_OIDC_TOKEN??'';
if(!/^https:\/\//.test(base)) throw new Error('PREVIEW_BASE_URL_REQUIRED');
if(!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXPECTED_COMMIT_SHA_INVALID');
if(!oidc) throw new Error('VERCEL_TRUSTED_OIDC_TOKEN_REQUIRED');

const headers={'content-type':'application/json','x-vercel-trusted-oidc-idp-token':oidc};

async function json(path,init={}){
  const response=await fetch(`${base}${path}`,{...init,headers:{...headers,...(init.headers??{})}});
  const text=await response.text();
  let body;try{body=JSON.parse(text);}catch{body={raw:text.slice(0,500)}}
  if(!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const build=await json('/api/build-info',{method:'GET'});
const runtimeSha=String(build?.commitSha??build?.gitCommitSha??build?.sha??'');
if(runtimeSha!==expectedSha) throw new Error(`EXACT_HEAD_MISMATCH expected=${expectedSha} actual=${runtimeSha||'missing'}`);

const startedAt=new Date().toISOString();
const initiation=await json('/api/paystack-rehearsal',{method:'POST',body:JSON.stringify({action:'initiate'})});
if(initiation?.ok!==true||initiation?.rehearsal?.provider!=='PAYSTACK') throw new Error('PAYSTACK_INITIATION_EVIDENCE_INVALID');
const reference=String(initiation.rehearsal.reference??'');
if(!/^wfc-rc2-[A-Za-z0-9-]{8,80}$/.test(reference)) throw new Error('PAYSTACK_REFERENCE_INVALID');

const verificationAttempts=[];
for(let attempt=1;attempt<=6;attempt+=1){
  if(attempt>1) await new Promise(resolve=>setTimeout(resolve,5000));
  const verification=await json('/api/paystack-rehearsal',{method:'POST',body:JSON.stringify({action:'verify',reference})});
  verificationAttempts.push({attempt,observedAt:new Date().toISOString(),...verification});
  const state=verification?.rehearsal?.state;
  if(state==='CONFIRMED'||state==='FAILED'||state==='REVERSED') break;
}

const finalVerification=verificationAttempts.at(-1);
if(!finalVerification?.ok||finalVerification?.rehearsal?.provider!=='PAYSTACK') throw new Error('PAYSTACK_VERIFICATION_EVIDENCE_INVALID');

console.log(JSON.stringify({rehearsal:'SW1-RC2-PAYSTACK-REAL-PROVIDER',expectedCommitSha:expectedSha,runtimeCommitSha:runtimeSha,previewBaseUrl:base,startedAt,completedAt:new Date().toISOString(),initiation,verificationAttempts,liveFundsAuthorized:false,secretExposed:false},null,2));
