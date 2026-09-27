import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/catalog-admin.js';

function response(){
  const result={statusCode:null,body:null,headers:{}};
  return {
    result,
    setHeader(name,value){result.headers[String(name).toLowerCase()]=value;return this;},
    status(code){result.statusCode=code;return this;},
    json(body){result.body=body;return this;}
  };
}

const ENV_KEYS=['VERCEL_ENV','VERCEL','PRODUCTION_APPLICATION_ACCESS_ENABLED','OIDC_ISSUER','OIDC_AUDIENCE','OIDC_JWKS_URI','DATABASE_URL'];

function withEnv(overrides,fn){
  return async()=>{
    const prior=Object.fromEntries(ENV_KEYS.map(k=>[k,process.env[k]]));
    try{
      for(const k of ENV_KEYS)delete process.env[k];
      Object.assign(process.env,overrides);
      await fn();
    }finally{
      for(const k of ENV_KEYS)delete process.env[k];
      for(const [k,v] of Object.entries(prior))if(v!==undefined)process.env[k]=v;
    }
  };
}

for(const value of [undefined,'','production','staging','Preview','PRODUCTION']){
  test(`J20 catalog mutation is no longer refused by a flat environment ban when VERCEL_ENV is ${JSON.stringify(value)}`,withEnv(value===undefined?{}:{VERCEL_ENV:value},async()=>{
    const res=response();
    await handler({method:'POST',headers:{},body:{}},res);
    assert.notEqual(res.result.body?.error,'CATALOG_MUTATION_ENVIRONMENT_NOT_AUTHORIZED');
  }));
}

test('J20 catalog mutation in production now requires real production authentication, not an environment flag',withEnv({VERCEL_ENV:'production',PRODUCTION_APPLICATION_ACCESS_ENABLED:'true'},async()=>{
  const res=response();
  await handler({method:'POST',headers:{},body:{}},res);
  // No OIDC config and no member session bearer token: falls through to the
  // real production auth pipeline and fails there, never on an env check.
  assert.equal(res.result.body?.error,'PRODUCTION_AUTH_NOT_CONFIGURED');
  assert.equal(res.result.statusCode,503);
}));

test('J20 catalog GET also goes through real authorization in production (no longer method-exempt from the removed env ban)',withEnv({VERCEL_ENV:'production',PRODUCTION_APPLICATION_ACCESS_ENABLED:'true'},async()=>{
  const res=response();
  await handler({method:'GET',headers:{},body:{}},res);
  assert.equal(res.result.body?.error,'PRODUCTION_AUTH_NOT_CONFIGURED');
  assert.equal(res.result.statusCode,503);
}));
