import assert from 'node:assert/strict';

const rawBase=process.env.PRODUCTION_BASE_URL?.replace(/\/$/,'');
const expectedSha=process.env.EXPECTED_COMMIT_SHA;
if(!rawBase)throw new Error('PRODUCTION_BASE_URL required');
if(!expectedSha)throw new Error('EXPECTED_COMMIT_SHA required');
assert.match(expectedSha,/^[0-9a-f]{40}$/,'EXPECTED_COMMIT_SHA must be a full 40-character Git SHA');

const target=new URL(rawBase);
assert.equal(target.protocol,'https:','PRODUCTION_BASE_URL must use https');
assert.equal(target.pathname,'/','PRODUCTION_BASE_URL must be an origin without a path');
assert.equal(target.search,'','PRODUCTION_BASE_URL must not contain a query string');
assert.equal(target.hash,'','PRODUCTION_BASE_URL must not contain a fragment');
const base=target.origin;

async function json(path,init={}){
  const response=await fetch(`${base}${path}`,init);
  let body={};
  const text=await response.text();
  try{body=text?JSON.parse(text):{};}catch{body={raw:text.slice(0,300)};}
  return{status:response.status,body};
}

const build=await json('/api/build-info');
assert.equal(build.status,200,'build-info must remain available during rollback');
assert.equal(build.body?.commitSha,expectedSha,'runtime SHA must match rollback target');
assert.equal(build.body?.environment,'production','rollback rehearsal must target Production');

for(const path of ['/api/member-orders','/api/member-notifications','/api/operator-orders']){
  const result=await json(path,{headers:{authorization:'Bearer rollback-probe-token'}});
  assert.equal(result.status,503,`${path} must fail closed while Production access kill switch is disabled`);
  assert.equal(result.body?.error,'PRODUCTION_APPLICATION_ACCESS_DISABLED',`${path} must expose the bounded rollback error`);
}

for(const path of ['/api/commit-sandbox','/api/pay-sandbox','/api/fulfillment-ready','/api/accept-fulfillment','/api/authorize-refund','/api/complete-refund']){
  const result=await json(path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(result.status,403,`${path} must remain disabled in Production during rollback`);
}

console.log(JSON.stringify({
  ok:true,
  expectedCommitSha:expectedSha,
  runtimeCommitSha:build.body.commitSha,
  productionAccess:'DISABLED',
  protectedReadRoutes:['member-orders','member-notifications','operator-orders'],
  sandboxMutationRoutes:['commit-sandbox','pay-sandbox','fulfillment-ready','accept-fulfillment','authorize-refund','complete-refund'],
  liveFundsAuthorized:false
},null,2));
