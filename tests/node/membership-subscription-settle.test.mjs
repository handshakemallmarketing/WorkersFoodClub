import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';
import handler from '../../api/membership-subscription-settle.js';

const NOW=Date.parse('2026-09-18T12:00:00Z'),NOW_SEC=Math.floor(NOW/1000);
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});Object.assign(jwk,{kid:'settle-test',alg:'RS256',use:'sig'});
const ENV={PRODUCTION_APPLICATION_ACCESS_ENABLED:'true',OIDC_ISSUER:'https://identity.example.test/',OIDC_AUDIENCE:'workers-food-club-api',OIDC_JWKS_URI:'https://identity.example.test/jwks'};
function token(sub='oidc|member'){const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:ENV.OIDC_ISSUER,aud:ENV.OIDC_AUDIENCE,sub,exp:NOW_SEC+3600,iat:NOW_SEC-5})).toString('base64url'),s=signData('RSA-SHA256',Buffer.from(`${h}.${p}`),privateKey).toString('base64url');return `${h}.${p}.${s}`;}
function req(body={}){return{method:'POST',headers:{authorization:`Bearer ${token()}`,'x-request-id':'req:settle'},body};}
function res(){const r={statusCode:null,body:null,headers:{}};return{r,setHeader(k,v){r.headers[k]=v;},status(c){r.statusCode=c;return this;},json(b){r.body=b;return this;}};}

function sqlFixture({invoiceState='OPEN',evidence=null,membershipState='INACTIVE',standing=null,owner='participant:member',atomicWins=true,atomicError=false,memberType='PRIMARY',publicMemberId=null}={}){
  const calls=[];
  const sql=async(strings,...values)=>{
    const text=strings.join('?');calls.push({text,values});
    if(text.includes('FROM application_identity_binding')&&!text.includes('WITH settled_invoice'))return[{participant_id:'participant:member',state:'ACTIVE'}];
    if(text.includes('FROM membership_subscription_invoice i JOIN application_membership'))return[{invoice_id:'invoice:1',membership_id:'membership:1',state:invoiceState,settlement_evidence_id:evidence,participant_id:owner,membership_state:membershipState,standing:standing??(membershipState==='ACTIVE'?'ACTIVE':'INITIAL_FEE_DUE'),member_type:memberType,public_member_id:publicMemberId||(membershipState==='ACTIVE'?'WFC-P-EXISTING':null)}];
    if(text.includes('WITH settled_invoice')){
      if(atomicError){const error=new Error('division by zero');error.code='22012';throw error;}
      return atomicWins?[{membership_id:'membership:1',public_member_id:publicMemberId||'WFC-P-ACTIVATED',ok:1}]:[];
    }
    throw new Error(`UNEXPECTED_QUERY ${text}`);
  };
  sql.calls=calls;return sql;
}
async function invoke(sql,body={invoiceId:'invoice:1',settlementEvidenceId:'evidence:pay:1'}){const out=res();await handler(req(body),out,{sql,env:ENV,now:NOW,production:{env:ENV,now:NOW,jwksResolver:async()=>({keys:[jwk]})}});return out.r;}
test.beforeEach(()=>{process.env.VERCEL_ENV='production';});

test('OPEN invoice activates INACTIVE PRIMARY membership through one atomic statement',async()=>{const sql=sqlFixture(),r=await invoke(sql);assert.equal(r.statusCode,200);assert.equal(r.body.membershipState,'ACTIVE');assert.equal(r.body.standing,'ACTIVE');assert.equal(r.body.idempotent,false);const atomic=sql.calls.filter(c=>c.text.includes('WITH settled_invoice'));assert.equal(atomic.length,1);assert.match(atomic[0].text,/UPDATE membership_subscription_invoice/);assert.match(atomic[0].text,/UPDATE application_membership/);assert.match(atomic[0].text,/UPDATE application_identity_binding/);assert.match(atomic[0].text,/INSERT INTO application_access_audit/);assert.match(atomic[0].text,/invariant_guard/);});
test('same evidence replay is idempotent and performs no atomic mutation',async()=>{const sql=sqlFixture({invoiceState:'PAID',evidence:'evidence:pay:1',membershipState:'ACTIVE'}),r=await invoke(sql);assert.equal(r.statusCode,200);assert.equal(r.body.idempotent,true);assert.equal(sql.calls.some(c=>c.text.includes('WITH settled_invoice')),false);});
test('different evidence cannot replay a paid invoice',async()=>{const r=await invoke(sqlFixture({invoiceState:'PAID',evidence:'evidence:other',membershipState:'ACTIVE'}));assert.equal(r.statusCode,409);assert.equal(r.body.error,'INVOICE_ALREADY_SETTLED_DIFFERENT_EVIDENCE');});
test('member cannot settle another participant invoice',async()=>{const r=await invoke(sqlFixture({owner:'participant:other'}));assert.equal(r.statusCode,403);assert.equal(r.body.error,'SUBSCRIPTION_INVOICE_NOT_OWNED');});
test('non-primary subscription settlement fails closed',async()=>{const r=await invoke(sqlFixture({memberType:'HOUSEHOLD_BENEFICIARY'}));assert.equal(r.statusCode,409);assert.equal(r.body.error,'PRIMARY_SUBSCRIPTION_REQUIRED');});
test('VOID invoice fails closed',async()=>{const r=await invoke(sqlFixture({invoiceState:'VOID'}));assert.equal(r.statusCode,409);assert.equal(r.body.error,'SUBSCRIPTION_INVOICE_NOT_OPEN');});
test('already ACTIVE paid-standing membership cannot activate from an OPEN invoice',async()=>{const r=await invoke(sqlFixture({membershipState:'ACTIVE',standing:'ACTIVE'}));assert.equal(r.statusCode,409);assert.equal(r.body.error,'MEMBERSHIP_NOT_ACTIVATABLE');});
test('former employee PRIMARY membership in INITIAL_FEE_DUE can settle continuation invoice',async()=>{const r=await invoke(sqlFixture({membershipState:'ACTIVE',standing:'INITIAL_FEE_DUE',publicMemberId:'WFC-P-EMPLOYEE'}));assert.equal(r.statusCode,200);assert.equal(r.body.standing,'ACTIVE');});
test('compare-and-set loss returns atomic race without a second authority-grant statement',async()=>{const sql=sqlFixture({atomicWins:false}),r=await invoke(sql);assert.equal(r.statusCode,409);assert.equal(r.body.error,'SUBSCRIPTION_SETTLEMENT_ATOMIC_RACE');assert.equal(sql.calls.filter(c=>c.text.includes('WITH settled_invoice')).length,1);});
test('database invariant guard abort is fail-closed',async()=>{const sql=sqlFixture({atomicError:true}),r=await invoke(sql);assert.equal(r.statusCode,503);assert.equal(r.body.error,'SUBSCRIPTION_SETTLEMENT_FAILED');assert.equal(sql.calls.filter(c=>c.text.includes('WITH settled_invoice')).length,1);});
test('SUSPENDED PRIMARY membership may reactivate after exact invoice settlement',async()=>{const r=await invoke(sqlFixture({membershipState:'SUSPENDED'}));assert.equal(r.statusCode,200);assert.equal(r.body.membershipState,'ACTIVE');});
