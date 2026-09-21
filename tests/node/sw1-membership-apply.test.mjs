import test from 'node:test';
import assert from 'node:assert/strict';
import applyHandler from '../../api/membership-apply.js';

function response(){const result={statusCode:null,body:null,headers:{}};return{result,setHeader(n,v){result.headers[String(n).toLowerCase()]=v;return this},status(c){result.statusCode=c;return this},json(b){result.body=b;return this}}}
function request(method,body={},headers={}){return{method,headers,body}}
function autoSql(){const calls=[];const sql=async(strings,...values)=>{calls.push({text:strings.join('?'),values});return[{application_id:'application:test'}]};sql.calls=calls;return sql}
function manualSql(){const calls=[];const sql=async(strings,...values)=>{calls.push({text:strings.join('?'),values});return[]};sql.calls=calls;return sql}
const base=(sql,mode='AUTO')=>({env:{VERCEL_ENV:'preview',MEMBERSHIP_APPLICATION_REVIEW_MODE:mode},sql});
const valid={fullName:'Ama Mensah',governmentEmployer:'Ghana Health Service',email:'AMA@example.com',contactNote:' hello '};

test('rejects non-POST',async()=>{const r=response();await applyHandler(request('GET'),r,{});assert.equal(r.result.statusCode,405)});

test('AUTO creates numbered inactive member without authentication or subscription pricing',async()=>{
 const sql=autoSql(),r=response();await applyHandler(request('POST',valid),r,base(sql));
 assert.equal(r.result.statusCode,201);assert.equal(r.result.body.membershipProvisioned,true);
 assert.match(r.result.body.publicMemberId,/^WFC-P-[0-9A-F]{12}$/);
 assert.equal(r.result.body.membershipState,'INACTIVE');assert.equal(r.result.body.standing,'INITIAL_FEE_DUE');
 assert.equal(r.result.body.subscriptionInvoicePending,true);assert.equal(r.result.body.loginIdentityBound,false);
 assert.match(sql.calls[0].text,/public_member_id/);assert.match(sql.calls[0].text,/INSERT INTO application_membership/);
 assert.doesNotMatch(sql.calls[0].text,/membership_subscription_invoice/);assert.doesNotMatch(sql.calls[0].text,/application_identity_binding/);
});

test('membership creation persists server-issued member number before downstream subscription workflow',async()=>{
 const sql=autoSql(),r=response();await applyHandler(request('POST',valid),r,base(sql));
 assert.equal(r.result.statusCode,201);assert.ok(sql.calls[0].values.includes(r.result.body.publicMemberId));
 assert.equal(r.result.body.subscriptionInvoicePending,true);
 assert.doesNotMatch(sql.calls[0].text,/membership_subscription_invoice/);
});

test('arbitrary Authorization header has no enrollment authority',async()=>{const r=response();await applyHandler(request('POST',valid,{authorization:'Bearer arbitrary'}),r,base(autoSql()));assert.equal(r.result.statusCode,201)});
test('MANUAL review remains optional governed path',async()=>{const sql=manualSql(),r=response();await applyHandler(request('POST',valid),r,base(sql,'MANUAL'));assert.equal(r.result.statusCode,201);assert.equal(r.result.body.reviewRequired,true);assert.equal(r.result.body.membershipProvisioned,false)});
test('government employer required',async()=>{const r=response();await applyHandler(request('POST',{fullName:'Ama',email:'a@example.com'}),r,base(autoSql()));assert.equal(r.result.body.error,'GOVERNMENT_EMPLOYER_REQUIRED')});
test('email or phone required',async()=>{const r=response();await applyHandler(request('POST',{fullName:'Ama',governmentEmployer:'GHS'}),r,base(autoSql()));assert.equal(r.result.body.error,'EMAIL_OR_PHONE_REQUIRED')});
test('malformed email rejected',async()=>{const r=response();await applyHandler(request('POST',{fullName:'Ama',governmentEmployer:'GHS',email:'bad'}),r,base(autoSql()));assert.equal(r.result.body.error,'EMAIL_INVALID')});
