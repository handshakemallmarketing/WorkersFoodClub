import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/membership-subscription-settle.js';

const NOW=Date.parse('2026-09-18T12:00:00Z');
const PREVIEW_ENV={PRODUCTION_APPLICATION_ACCESS_ENABLED:'true',VERCEL_ENV:'preview'};
function req(body={invoiceId:'invoice:1',settlementEvidenceId:'evidence:1'},token='wfc_test_session'){return{method:'POST',headers:{'x-request-id':'req:settle',authorization:token?`Bearer ${token}`:''},body};}
function res(){const r={statusCode:null,body:null,headers:{}};return{r,setHeader(k,v){r.headers[k]=v;},status(c){r.statusCode=c;return this;},json(b){r.body=b;return this;}};}
function sqlFixture(result=[{membership_id:'membership:1',public_member_id:'WFC-P-PREISSUED',membership_state:'ACTIVE',standing:'ACTIVE',idempotent:false}]){
 const calls=[];const sql=async(strings,...values)=>{const text=strings.join('?');calls.push({text,values});assert.match(text,/settle_membership_subscription/);return result;};sql.calls=calls;return sql;
}
async function invoke(sql,{authorized=true,env=PREVIEW_ENV,body,token='wfc_test_session'}={}){const out=res();await handler(req(body,token),out,{sql,env,now:NOW,authorizeSettlement:()=>authorized});return out.r;}

test('settlement delegates authenticated member, evidence validation and transition to one database function',async()=>{const sql=sqlFixture(),r=await invoke(sql);assert.equal(r.statusCode,200);assert.equal(r.body.idempotent,false);assert.equal(r.body.publicMemberId,'WFC-P-PREISSUED');assert.equal(r.body.loginIdentityBound,true);assert.equal(sql.calls.length,1);assert.deepEqual(sql.calls[0].values.slice(0,2),['invoice:1','evidence:1']);assert.match(String(sql.calls[0].values[2]),/^member-session:[a-f0-9]{64}$/);});
test('database evidence rejection fails closed',async()=>{const r=await invoke(sqlFixture([]));assert.equal(r.statusCode,409);assert.equal(r.body.error,'SUBSCRIPTION_SETTLEMENT_EVIDENCE_REJECTED');});
test('idempotent response reports current durable membership truth',async()=>{const r=await invoke(sqlFixture([{membership_id:'membership:1',public_member_id:'WFC-P-PREISSUED',membership_state:'SUSPENDED',standing:'SUSPENDED',idempotent:true}]));assert.equal(r.statusCode,200);assert.equal(r.body.idempotent,true);assert.equal(r.body.membershipState,'SUSPENDED');assert.equal(r.body.standing,'SUSPENDED');});
test('untrusted caller rejected before database access',async()=>{const sql=sqlFixture(),r=await invoke(sql,{authorized:false});assert.equal(r.statusCode,401);assert.equal(sql.calls.length,0);});
test('missing native member session is rejected before database access',async()=>{const sql=sqlFixture(),r=await invoke(sql,{token:''});assert.equal(r.statusCode,401);assert.equal(r.body.error,'MEMBER_SESSION_REQUIRED');assert.equal(sql.calls.length,0);});
test('Production settlement stays separately withheld even with application access and settlement token',async()=>{const sql=sqlFixture(),r=await invoke(sql,{env:{PRODUCTION_APPLICATION_ACCESS_ENABLED:'true',VERCEL_ENV:'production'},authorized:true});assert.equal(r.statusCode,403);assert.equal(r.body.error,'PRODUCTION_MEMBERSHIP_SETTLEMENT_NOT_AUTHORIZED');assert.equal(sql.calls.length,0);});
test('required identifiers are validated before database access',async()=>{const sql=sqlFixture(),r=await invoke(sql,{body:{invoiceId:'',settlementEvidenceId:'evidence:1'}});assert.equal(r.statusCode,400);assert.equal(sql.calls.length,0);});
