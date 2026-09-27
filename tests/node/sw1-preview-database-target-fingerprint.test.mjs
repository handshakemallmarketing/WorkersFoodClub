import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import dbHealth from '../../api/db-health.js';

function response(){
  return {
    statusCode:200,
    headers:{},
    body:null,
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
  };
}

async function run(env){
  const prior={VERCEL_ENV:process.env.VERCEL_ENV,DATABASE_URL:process.env.DATABASE_URL};
  for(const key of Object.keys(prior))delete process.env[key];
  Object.assign(process.env,env);
  try{
    const res=response();
    await dbHealth({method:'GET',url:'/api/db-health?probe=database-target-fingerprint'},res);
    return res;
  }finally{
    for(const key of Object.keys(prior))delete process.env[key];
    for(const [key,value] of Object.entries(prior))if(value!==undefined)process.env[key]=value;
  }
}

test('Preview database target probe returns only a stable hostname fingerprint',async()=>{
  const hostname='ep-isolated-preview.us-east-2.aws.neon.tech';
  const res=await run({VERCEL_ENV:'preview',DATABASE_URL:`postgresql://user:secret@${hostname}/neondb?sslmode=require`});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{
    ok:true,
    environment:'preview',
    algorithm:'sha256',
    hostSha256:createHash('sha256').update(hostname).digest('hex'),
  });
  assert.equal(JSON.stringify(res.body).includes('secret'),false);
  assert.equal(JSON.stringify(res.body).includes(hostname),false);
  assert.equal(res.headers['Cache-Control'],'no-store');
});

test('database target fingerprint fails closed outside Preview',async()=>{
  const res=await run({VERCEL_ENV:'production',DATABASE_URL:'postgresql://user:secret@prod.example/neondb'});
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'DATABASE_TARGET_FINGERPRINT_PREVIEW_ONLY');
});

test('database target fingerprint fails closed without a database binding',async()=>{
  const res=await run({VERCEL_ENV:'preview'});
  assert.equal(res.statusCode,503);
  assert.equal(res.body.error,'DATABASE_URL_MISSING');
});
