import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {GovernedTransferEvaluator,GovernedTransferPolicyRegistry} from '../../dist/packages/transfer/src/index.js';

const pid=x=>asId(x);const eid=x=>asId(x);const gid=x=>asId(x);
const policy=(overrides={})=>({id:'policy:pickup',version:1,transactionType:'PILOT_PICKUP',title:{dimension:'TITLE',trigger:'ACCEPTANCE'},risk:{dimension:'RISK',trigger:'HANDOVER'},effectiveFrom:'2026-09-08T03:00:00Z',authorizedBy:pid('participant:board'),authorityGrantId:'grant:transfer',evidenceIds:[eid('evidence:ratification')],status:'RATIFIED',...overrides});
const event=(id,type,time)=>({id,transactionId:'tx:1',type,occurredAt:time,evidenceIds:[eid(`evidence:${id}`)]});
const registry=()=>{const s=new InMemoryAuthorityStore();s.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:',validFrom:'2026-09-01T00:00:00Z'});return {store:s,registry:new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s))};};

test('INV-019 title and risk are orthogonal and may transfer at different events',()=>{
 const {registry:r}=registry();r.ratify(policy());const e=new GovernedTransferEvaluator(r);
 const afterHandover=e.evaluate({transactionId:'tx:1',transactionType:'PILOT_PICKUP',policyId:'policy:pickup',policyVersion:1,events:[event('handover:1','HANDOVER','2026-09-08T03:05:00Z')]});
 assert.equal(afterHandover.riskTransferred,true);assert.equal(afterHandover.titleTransferred,false);assert.equal(afterHandover.riskEventId,'handover:1');
 const afterAcceptance=e.evaluate({transactionId:'tx:1',transactionType:'PILOT_PICKUP',policyId:'policy:pickup',policyVersion:1,events:[event('handover:1','HANDOVER','2026-09-08T03:05:00Z'),event('acceptance:1','ACCEPTANCE','2026-09-08T03:10:00Z')]});
 assert.equal(afterAcceptance.riskTransferred,true);assert.equal(afterAcceptance.titleTransferred,true);assert.equal(afterAcceptance.titleEventId,'acceptance:1');
});

test('INV-019 payment, handover or delivered-like events do not silently manufacture title',()=>{
 const {registry:r}=registry();r.ratify(policy());const e=new GovernedTransferEvaluator(r);
 const result=e.evaluate({transactionId:'tx:1',transactionType:'PILOT_PICKUP',policyId:'policy:pickup',policyVersion:1,events:[event('settlement:1','SETTLEMENT','2026-09-08T03:02:00Z'),event('handover:1','HANDOVER','2026-09-08T03:05:00Z'),event('delivered:1','DELIVERED_AT','2026-09-08T03:06:00Z')]});
 assert.equal(result.riskTransferred,true);assert.equal(result.titleTransferred,false);
});

test('RC1-B04 transaction requires an explicitly ratified policy version',()=>{
 const {registry:r}=registry();const e=new GovernedTransferEvaluator(r);
 assert.throws(()=>e.evaluate({transactionId:'tx:1',transactionType:'PILOT_PICKUP',policyId:'policy:missing',policyVersion:1,events:[]}),/TRANSFER_POLICY_REQUIRED/);
 r.ratify(policy());
 assert.throws(()=>e.evaluate({transactionId:'tx:1',transactionType:'PILOT_PICKUP',policyId:'policy:pickup',policyVersion:2,events:[]}),/TRANSFER_POLICY_REQUIRED/);
});

test('RC3-B02 fabricated caller authorization cannot ratify transfer policy',()=>{
 const empty=new InMemoryAuthorityStore();const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(empty));
 assert.throws(()=>r.ratify(policy(),{participantId:pid('participant:board'),authorityGrantId:'grant:transfer',scope:'TRANSFER_POLICY_GOVERNANCE',validFrom:'2026-09-01T00:00:00Z'}),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('RC3-B02 revoked real authority cannot ratify transfer policy',()=>{
 const s=new InMemoryAuthorityStore();s.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:',validFrom:'2026-09-01T00:00:00Z'});s.revoke(gid('grant:transfer'),'2026-09-08T02:59:59Z');const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s));
 assert.throws(()=>r.ratify(policy()),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('RC3-B02 ratification checks trusted current time rather than caller effectiveFrom',()=>{
 const s=new InMemoryAuthorityStore();s.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:',validFrom:'2026-09-01T00:00:00Z'});s.revoke(gid('grant:transfer'),'2026-09-08T03:05:00Z');
 const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s),()=> '2026-09-08T03:10:00Z');
 assert.throws(()=>r.ratify(policy({effectiveFrom:'2026-09-08T03:00:00Z'})),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('RC3-B02 wrong actor cannot reuse a valid transfer-policy grant',()=>{
 const s=new InMemoryAuthorityStore();s.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:',validFrom:'2026-09-01T00:00:00Z'});const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s));
 assert.throws(()=>r.ratify(policy({authorizedBy:pid('participant:attacker')})),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('RC3-B02 wrong action grant cannot ratify transfer policy',()=>{
 const s=new InMemoryAuthorityStore();s.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['ApproveCatalog'],targetPrefix:'policy:',validFrom:'2026-09-01T00:00:00Z'});const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s));
 assert.throws(()=>r.ratify(policy()),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('RC3-B02 wrong target scope cannot ratify transfer policy',()=>{
 const s=new InMemoryAuthorityStore();s.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:other:',validFrom:'2026-09-01T00:00:00Z'});const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s));
 assert.throws(()=>r.ratify(policy()),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('RC3-B02 not-yet-valid and expired grants cannot ratify transfer policy',()=>{
 const future=new InMemoryAuthorityStore();future.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:',validFrom:'2026-09-09T00:00:00Z'});assert.throws(()=>new GovernedTransferPolicyRegistry(new AuthorityEvaluator(future),()=> '2026-09-08T03:00:00Z').ratify(policy()),/TRANSFER_POLICY_UNAUTHORIZED/);
 const expired=new InMemoryAuthorityStore();expired.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-08T02:59:59Z'});assert.throws(()=>new GovernedTransferPolicyRegistry(new AuthorityEvaluator(expired),()=> '2026-09-08T03:00:00Z').ratify(policy()),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('RC3-B02 a grant scoped to one policy cannot be reused cross-policy',()=>{
 const s=new InMemoryAuthorityStore();s.put({id:gid('grant:transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'policy:pickup',validFrom:'2026-09-01T00:00:00Z'});const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s));
 r.ratify(policy());
 assert.throws(()=>r.ratify(policy({id:'policy:delivery'})),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('INV-024 policy versions are immutable and sequential rather than silently rewritten',()=>{
 const {registry:r}=registry();r.ratify(policy());
 assert.throws(()=>r.ratify(policy()),/TRANSFER_POLICY_VERSION_DUPLICATE/);
 const v2=policy({version:2,effectiveFrom:'2026-09-09T00:00:00Z',title:{dimension:'TITLE',trigger:'NAMED_EVENT',eventType:'TITLE_RELEASE'}});
 r.ratify(v2);assert.equal(r.get('policy:pickup',1).title.trigger,'ACCEPTANCE');assert.equal(r.get('policy:pickup',2).title.trigger,'NAMED_EVENT');
});

test('INV-019 named policy trigger proves no universal delivered_at rule exists',()=>{
 const {registry:r}=registry();r.ratify(policy({title:{dimension:'TITLE',trigger:'NAMED_EVENT',eventType:'TITLE_RELEASE'},risk:{dimension:'RISK',trigger:'ACCEPTANCE'}}));const e=new GovernedTransferEvaluator(r);
 const before=e.evaluate({transactionId:'tx:1',transactionType:'PILOT_PICKUP',policyId:'policy:pickup',policyVersion:1,events:[event('handover:1','HANDOVER','2026-09-08T03:05:00Z'),event('acceptance:1','ACCEPTANCE','2026-09-08T03:10:00Z')]});
 assert.equal(before.riskTransferred,true);assert.equal(before.titleTransferred,false);
 const after=e.evaluate({transactionId:'tx:1',transactionType:'PILOT_PICKUP',policyId:'policy:pickup',policyVersion:1,events:[event('handover:1','HANDOVER','2026-09-08T03:05:00Z'),event('acceptance:1','ACCEPTANCE','2026-09-08T03:10:00Z'),event('title:1','TITLE_RELEASE','2026-09-08T03:15:00Z')]});
 assert.equal(after.titleTransferred,true);assert.equal(after.titleEventId,'title:1');
});
