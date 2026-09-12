import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import { requireApplicationAuth } from '../../lib/application-auth.js';
import { mintPreviewApiToken } from '../../lib/preview-api-auth.js';

const PREVIEW_SECRET = 'rc3-app-auth-preview-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const NOW = Date.parse('2026-09-12T11:30:00Z');
const NOW_SEC = Math.floor(NOW / 1000);

function response(){const result={statusCode:null,body:null,headers:{}};return{result,setHeader(n,v){result.headers[String(n).toLowerCase()]=v;return this;},status(c){result.statusCode=c;return this;},json(b){result.body=b;return this;}};}
function request(token){return{headers:token?{authorization:`Bearer ${token}`}:{}};}
function previewToken(actorId='preview:member:001',scopes=['member:orders.read']){return mintPreviewApiToken({secret:PREVIEW_SECRET,subject:`preview:${actorId}`,actorId,scopes,issuedAt:NOW_SEC-5,expiresAt:NOW_SEC+300});}

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});jwk.kid='rc3-app-auth-key';jwk.alg='RS256';jwk.use='sig';
const productionEnv={OIDC_ISSUER:'https://identity.example.test/',OIDC_AUDIENCE:'workers-food-club-api',OIDC_JWKS_URI:'https://identity.example.test/.well-known/jwks.json',OIDC_ACTOR_CLAIM:'https://foodclub.example/actor_id',OIDC_SCOPE_CLAIM:'scope'};
function productionToken({actorId='attacker-chosen-actor',scopes='member:orders.read'}={}){const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');const p=Buffer.from(JSON.stringify({iss:productionEnv.OIDC_ISSUER,aud:productionEnv.OIDC_AUDIENCE,sub:'oidc|prod-user-001',exp:NOW_SEC+300,iat:NOW_SEC-5,scope:scopes,[productionEnv.OIDC_ACTOR_CLAIM]:actorId})).toString('base64url');const s=signData('RSA-SHA256',Buffer.from(`${h}.${p}`),privateKey).toString('base64url');return `${h}.${p}.${s}`;}
const productionOptions={now:NOW,production:{now:NOW,env:productionEnv,jwksResolver:async()=>({keys:[jwk]})},bindingResolver:async(identity,requiredScope)=>({ok:true,principal:{issuer:identity.issuer,subject:identity.subject,actorId:'member:canonical-001',scopes:[requiredScope],bindingId:'binding:001',expiresAt:identity.expiresAt}})};

test('RC3 unified auth preserves bounded Preview HMAC semantics',async()=>{process.env.VERCEL_ENV='preview';process.env.PREVIEW_API_AUTH_SECRET=PREVIEW_SECRET;const res=response();const principal=await requireApplicationAuth(request(previewToken()),res,'member:orders.read','preview:member:001',{now:NOW});assert.equal(principal?.actorId,'preview:member:001');assert.equal(res.result.statusCode,null);});
test('RC3 unified auth preserves Preview actor mismatch rejection',async()=>{process.env.VERCEL_ENV='preview';process.env.PREVIEW_API_AUTH_SECRET=PREVIEW_SECRET;const res=response();const principal=await requireApplicationAuth(request(previewToken('preview:member:attacker')),res,'member:orders.read','preview:member:001',{now:NOW});assert.equal(principal,null);assert.equal(res.result.statusCode,403);assert.equal(res.result.body?.error,'AUTHENTICATED_ACTOR_MISMATCH');});
test('RC3 production never falls back to Preview HMAC token',async()=>{process.env.VERCEL_ENV='production';process.env.PREVIEW_API_AUTH_SECRET=PREVIEW_SECRET;const res=response();const principal=await requireApplicationAuth(request(previewToken()),res,'member:orders.read','preview:member:001',productionOptions);assert.equal(principal,null);assert.equal(res.result.statusCode,401);assert.equal(res.result.body?.error,'TOKEN_INVALID');});
test('RC3 production ignores IdP actor claim and uses server-side canonical binding',async()=>{process.env.VERCEL_ENV='production';const res=response();const principal=await requireApplicationAuth(request(productionToken({actorId:'member:attacker-selected'})),res,'member:orders.read','preview:member:001',productionOptions);assert.equal(principal?.actorId,'member:canonical-001');assert.equal(principal?.subject,'oidc|prod-user-001');assert.equal(principal?.bindingId,'binding:001');assert.equal(res.result.statusCode,null);});
test('RC3 production valid identity without application binding fails closed',async()=>{process.env.VERCEL_ENV='production';const res=response();const principal=await requireApplicationAuth(request(productionToken()),res,'member:orders.read','preview:member:001',{...productionOptions,bindingResolver:async()=>({ok:false,status:403,error:'APPLICATION_IDENTITY_NOT_BOUND'})});assert.equal(principal,null);assert.equal(res.result.statusCode,403);assert.equal(res.result.body?.error,'APPLICATION_IDENTITY_NOT_BOUND');});
test('RC3 production fails closed when OIDC configuration is missing even if Preview secret exists',async()=>{process.env.VERCEL_ENV='production';process.env.PREVIEW_API_AUTH_SECRET=PREVIEW_SECRET;const res=response();const principal=await requireApplicationAuth(request(previewToken()),res,'member:orders.read','preview:member:001',{production:{env:{},now:NOW}});assert.equal(principal,null);assert.equal(res.result.statusCode,503);assert.equal(res.result.body?.error,'PRODUCTION_AUTH_NOT_CONFIGURED');});
