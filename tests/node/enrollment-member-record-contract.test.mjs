import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../../api/membership-apply.js';

const settleSource=fs.readFileSync(new URL('../../api/membership-subscription-settle.js',import.meta.url),'utf8');
function response(){const out={statusCode:null,body:null};return{out,setHeader(){},status(code){out.statusCode=code;return this},json(body){out.body=body;return this}}}
function successfulSql(calls=[]){return async(strings,...values)=>{calls.push({text:strings.join('?'),values});const membershipId=values.find(v=>typeof v==='string'&&v.startsWith('membership:'));return[{application_id:'application:test',resulting_membership_id:membershipId}]}}

test('prospect creates and links numbered inactive membership with no subscription fee configured',async()=>{
 const calls=[],sql=successfulSql(calls),res=response();
 await handler({method:'POST',headers:{},body:{fullName:'Test Member',governmentEmployer:'Ministry of Education',email:'test.member@example.com'}},res,{env:{VERCEL_ENV:'preview',MEMBERSHIP_APPLICATION_REVIEW_MODE:'AUTO'},sql,now:Date.parse('2026-09-21T00:00:00Z')});
 assert.equal(res.out.statusCode,201);assert.equal(res.out.body.membershipProvisioned,true);assert.match(res.out.body.publicMemberId,/^WFC-P-[0-9A-F]{12}$/);assert.equal(res.out.body.membershipState,'INACTIVE');assert.equal(res.out.body.standing,'INITIAL_FEE_DUE');assert.equal(res.out.body.subscriptionInvoicePending,true);
 const q=calls[0].text;assert.match(q,/INSERT INTO application_membership/);assert.match(q,/INSERT INTO membership_application/);assert.match(q,/resulting_membership_id/);assert.doesNotMatch(q,/UPDATE membership_application/);assert.doesNotMatch(q,/membership_subscription_invoice/);assert.ok(calls[0].values.includes(res.out.body.publicMemberId));
});

test('membership creation never requires annual fee configuration',async()=>{
 const sql=successfulSql(),res=response();await handler({method:'POST',body:{fullName:'No Fee Config',governmentEmployer:'Government Agency',phone:'0240000000'}},res,{env:{VERCEL_ENV:'preview'},sql});assert.equal(res.out.statusCode,201);assert.notEqual(res.out.body.error,'ANNUAL_MEMBERSHIP_FEE_NOT_CONFIGURED');
});

test('false or missing application-to-membership linkage fails closed',async()=>{
 const sql=async()=>[{application_id:'application:test',resulting_membership_id:null}],res=response();await handler({method:'POST',body:{fullName:'Broken Link',governmentEmployer:'Government Agency',phone:'0240000001'}},res,{env:{VERCEL_ENV:'preview'},sql});assert.equal(res.out.statusCode,503);assert.equal(res.out.body.failureCode,'MEMBERSHIP_RECORD_CREATION_FAILED');
});

test('settlement cannot mint or replace a Member Number',()=>{
 assert.match(settleSource,/MEMBER_NUMBER_NOT_ISSUED/);assert.doesNotMatch(settleSource,/randomBytes|randomUUID|WFC-P-/);const membershipUpdates=[...settleSource.matchAll(/UPDATE\s+application_membership\b([\s\S]*?)(?=RETURNING|;|`)/gi)].map(m=>m[1]);for(const update of membershipUpdates){const setClause=(update.match(/\bSET\b([\s\S]*?)(?:\bFROM\b|\bWHERE\b|$)/i)||[])[1]||'';assert.doesNotMatch(setClause,/\bpublic_member_id\s*=/i);}
});
