import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/membership-apply.js';

function response(){const out={statusCode:null,body:null};return{out,setHeader(){},status(code){out.statusCode=code;return this},json(body){out.body=body;return this}}}

test('prospect information creates numbered member record before payment',async()=>{
 const calls=[];
 const sql=async(strings,...values)=>{calls.push({text:strings.join('?'),values});return[{application_id:'application:test'}]};
 const res=response();
 await handler({method:'POST',headers:{},body:{fullName:'Test Member',governmentEmployer:'Ministry of Education',email:'test.member@example.com',phone:'+233200000001'}},res,{
  env:{VERCEL_ENV:'preview',MEMBERSHIP_APPLICATION_REVIEW_MODE:'AUTO',ANNUAL_MEMBERSHIP_FEE_MINOR:'12000'},sql,annualFeeMinor:12000,now:Date.parse('2026-09-21T00:00:00Z')
 });
 assert.equal(res.out.statusCode,201);
 assert.equal(res.out.body.membershipProvisioned,true);
 assert.match(res.out.body.publicMemberId,/^WFC-P-[0-9A-F]{12}$/);
 assert.equal(res.out.body.membershipState,'INACTIVE');
 assert.equal(res.out.body.standing,'INITIAL_FEE_DUE');
 assert.match(res.out.body.invoiceId,/^subscription-invoice:/);
 assert.equal(res.out.body.invoiceAmountMinor,12000);
 assert.equal(res.out.body.invoiceCurrency,'GHS');
 const q=calls[0].text;
 assert.match(q,/public_member_id/);
 assert.ok(q.indexOf('INSERT INTO application_membership') < q.indexOf('INSERT INTO membership_subscription_invoice'));
 assert.ok(calls[0].values.includes(res.out.body.publicMemberId));
});
