import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../../api/membership-apply.js';

const settleSource=fs.readFileSync(new URL('../../api/membership-subscription-settle.js',import.meta.url),'utf8');
const truth=fs.readFileSync(new URL('../../docs/business-logic-v2/master-truth-matrix-amendment-external-services-2026-09-20.yaml',import.meta.url),'utf8');
function response(){const out={statusCode:null,body:null};return{out,setHeader(){},status(code){out.statusCode=code;return this},json(body){out.body=body;return this}}}

test('prospect creates numbered inactive member record and invoice before payment',async()=>{
 const calls=[];const sql=async(strings,...values)=>{calls.push({text:strings.join('?'),values});return[{application_id:'application:test'}]};const res=response();
 await handler({method:'POST',headers:{},body:{fullName:'Test Member',governmentEmployer:'Ministry of Education',email:'test.member@example.com'}},res,{env:{VERCEL_ENV:'preview',MEMBERSHIP_APPLICATION_REVIEW_MODE:'AUTO',ANNUAL_MEMBERSHIP_FEE_MINOR:'12000'},sql,annualFeeMinor:12000,now:Date.parse('2026-09-21T00:00:00Z')});
 assert.equal(res.out.statusCode,201);assert.equal(res.out.body.membershipProvisioned,true);assert.match(res.out.body.publicMemberId,/^WFC-P-[0-9A-F]{12}$/);assert.equal(res.out.body.membershipState,'INACTIVE');assert.equal(res.out.body.standing,'INITIAL_FEE_DUE');assert.match(res.out.body.invoiceId,/^subscription-invoice:/);assert.equal(res.out.body.invoiceAmountMinor,12000);assert.equal(res.out.body.invoiceCurrency,'GHS');
 const q=calls[0].text;assert.ok(q.indexOf('INSERT INTO application_membership')<q.indexOf('INSERT INTO membership_subscription_invoice'));assert.ok(calls[0].values.includes(res.out.body.publicMemberId));assert.match(q,/public_member_id/);
});

test('settlement cannot mint or replace a Member Number',()=>{assert.match(settleSource,/MEMBER_NUMBER_NOT_ISSUED/);assert.doesNotMatch(settleSource,/randomBytes|randomUUID|WFC-P-/);assert.doesNotMatch(settleSource,/UPDATE\s+application_membership[\s\S]*?SET[\s\S]*?public_member_id\s*=/i);});
test('canonical truth explicitly fixes identity-before-invoice-before-settlement ordering',()=>{assert.match(truth,/PROSPECT_INFORMATION_TO_MEMBERSHIP_RECORD_TO_MEMBER_NUMBER_TO_ANNUAL_INVOICE_TO_SETTLEMENT_TO_ACTIVE_MEMBERSHIP_TO_AUTHENTICATION/);assert.match(truth,/settlement_must_not_issue_or_replace_member_number: true/);});
