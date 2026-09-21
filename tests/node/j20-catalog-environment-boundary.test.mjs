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

for(const value of [undefined,'','production','staging','Preview','PRODUCTION']){
  test(`J20 catalog mutation fails closed when VERCEL_ENV is ${JSON.stringify(value)}`,async()=>{
    const prior=process.env.VERCEL_ENV;
    try{
      if(value===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=value;
      const res=response();
      await handler({method:'POST',headers:{},body:{}},res);
      assert.equal(res.result.statusCode,403);
      assert.equal(res.result.body?.error,'CATALOG_MUTATION_ENVIRONMENT_NOT_AUTHORIZED');
    }finally{
      if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;
    }
  });
}
