import test from 'node:test';import assert from 'node:assert/strict';import { createHash } from 'node:crypto';import completeHandler from '../../api/enrollment-verify-complete.js';
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
function response(){const out={statusCode:null,body:null};return{out,setHeader(){},status(c){out.statusCode=c;return this},json(b){out.body=b;return this}}}

test('rejects non-POST',async()=>{const r=response();await completeHandler({method:'GET'},r,{});assert.equal(r.out.statusCode,405)});
test('challenge id and 6-digit code required',async()=>{const r=response();await completeHandler({method:'POST',body:{challengeId:'',code:'12'}},r,{env:{VERCEL_ENV:'preview'}});assert.equal(r.out.body.error,'CHALLENGE_AND_CODE_REQUIRED')});

test('successful enrollment verification provisions a numbered membership and session',async()=>{
  const sql=async(strings)=>{const q=strings.join('?');if(q.includes('verify_and_provision_enrollment'))return[{challenge_state:'USED',challenge_attempts:0,application_id:'application:1',membership_id:'membership:new',public_member_id:'123456789012',session_id:'member-session:x',idempotent:false}];if(q.includes('WITH member AS'))return[{invoice_id:'subscription-invoice:1',membership_id:'membership:new',subscription_year:2026,amount_minor:12000,currency:'GHS',state:'OPEN',due_at:'2026-10-05T00:00:00.000Z',existing:false}];throw new Error('UNEXPECTED: '+q)};
  const r=response();await completeHandler({method:'POST',body:{challengeId:'enrollment-challenge:1',code:'123456'}},r,{env:{VERCEL_ENV:'preview'},sql,annualFeeMinor:12000,now:Date.parse('2026-09-21T00:00:00Z')});
  assert.equal(r.out.statusCode,200);assert.equal(r.out.body.accessState,'MEMBERSHIP_PAYMENT_REQUIRED');assert.match(r.out.body.publicMemberId,/^[0-9]{12}$/);assert.ok(r.out.body.sessionToken);assert.equal(r.out.body.invoiceId,'subscription-invoice:1');
});

test('wrong code does not provision and reports invalid',async()=>{
  const sql=async(strings)=>{const q=strings.join('?');if(q.includes('verify_and_provision_enrollment'))return[{challenge_state:'OPEN',challenge_attempts:1,application_id:null,membership_id:null,public_member_id:null,session_id:null,idempotent:null}];throw new Error('UNEXPECTED: '+q)};
  const r=response();await completeHandler({method:'POST',body:{challengeId:'enrollment-challenge:1',code:'000000'}},r,{env:{VERCEL_ENV:'preview'},sql,now:0});
  assert.equal(r.out.statusCode,401);assert.equal(r.out.body.error,'CHALLENGE_INVALID');assert.equal(r.out.body.sessionToken,undefined);
});

test('fifth wrong attempt locks the challenge and cannot provision',async()=>{
  const sql=async(strings)=>{const q=strings.join('?');if(q.includes('verify_and_provision_enrollment'))return[{challenge_state:'REVOKED',challenge_attempts:5,application_id:null,membership_id:null,public_member_id:null,session_id:null,idempotent:null}];throw new Error('UNEXPECTED: '+q)};
  const r=response();await completeHandler({method:'POST',body:{challengeId:'enrollment-challenge:1',code:'000000'}},r,{env:{VERCEL_ENV:'preview'},sql,now:0});
  assert.equal(r.out.statusCode,429);assert.equal(r.out.body.error,'CHALLENGE_LOCKED');
});

test('idempotent replay of an already-provisioned enrollment reuses the same Member Number',async()=>{
  const sql=async(strings)=>{const q=strings.join('?');if(q.includes('verify_and_provision_enrollment'))return[{challenge_state:'USED',challenge_attempts:0,application_id:'application:1',membership_id:'membership:existing',public_member_id:'999999999999',session_id:'member-session:reused',idempotent:true}];if(q.includes('WITH member AS'))return[{invoice_id:'subscription-invoice:1',membership_id:'membership:existing',subscription_year:2026,amount_minor:12000,currency:'GHS',state:'OPEN',due_at:'2026-10-05T00:00:00.000Z',existing:true}];throw new Error('UNEXPECTED: '+q)};
  const r=response();await completeHandler({method:'POST',body:{challengeId:'enrollment-challenge:1',code:'123456'}},r,{env:{VERCEL_ENV:'preview'},sql,annualFeeMinor:12000,now:Date.parse('2026-09-21T00:00:00Z')});
  assert.equal(r.out.statusCode,200);assert.equal(r.out.body.idempotent,true);assert.equal(r.out.body.publicMemberId,'999999999999');
});

test('existing-member challenge (challenge: prefix) delegates to member sign-in semantics',async()=>{
  const hash=sha('123456');
  const sql=async(strings,challengeId,codeHash,now,sessionId)=>{const q=strings.join('?');if(q.includes('verify_member_auth_challenge'))return[{membership_id:'membership:1',code_hash:hash,state:'USED',attempts:0,participant_id:'participant:1',membership_state:'ACTIVE',standing:'ACTIVE',session_id:sessionId}];throw new Error('UNEXPECTED: '+q)};
  const r=response();await completeHandler({method:'POST',body:{challengeId:'challenge:1',code:'123456'}},r,{env:{VERCEL_ENV:'preview'},sql,now:0});
  assert.equal(r.out.statusCode,200);assert.equal(r.out.body.accessState,'MEMBER_AUTHENTICATED');assert.ok(r.out.body.sessionToken);assert.equal(r.out.body.publicMemberId,undefined);
});
