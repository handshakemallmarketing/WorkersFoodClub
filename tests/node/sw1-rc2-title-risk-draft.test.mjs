import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {GovernedTransferPolicyRegistry,GovernedTransferEvaluator} from '../../dist/packages/transfer/src/index.js';

const policy=fs.readFileSync(new URL('../../docs/policies/GH-PILOT-TITLE-RISK-v1.md',import.meta.url),'utf8');
const pid=x=>asId(x);const eid=x=>asId(x);const gid=x=>asId(x);

test('RC2-LEGAL-001 owner-ratified policy remains explicitly production-gated',()=>{
 assert.match(policy,/Status: OWNER-RATIFIED — GOVERNANCE\/LEGAL EVIDENCE PENDING/);
 assert.match(policy,/System Owner has ratified the business-policy content/i);
 assert.match(policy,/not.*production release.*authorized/i);
 assert.match(policy,/Partial acceptance transfers only accepted quantity/i);
 assert.match(policy,/Ghana legal review.*external evidence/i);
});

test('GH pilot ratified binding keeps payment, settlement and handover from manufacturing transfer',()=>{
 const s=new InMemoryAuthorityStore();
 s.put({id:gid('grant:gh-pilot-transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'GH-PILOT-TITLE-RISK',validFrom:'2026-09-01T00:00:00Z'});
 const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s),()=> '2026-09-11T15:00:00Z');
 r.ratify({id:'GH-PILOT-TITLE-RISK',version:1,transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',title:{dimension:'TITLE',trigger:'ACCEPTANCE'},risk:{dimension:'RISK',trigger:'ACCEPTANCE'},effectiveFrom:'2026-09-11T15:00:00Z',authorizedBy:pid('participant:board'),authorityGrantId:'grant:gh-pilot-transfer',evidenceIds:[eid('evidence:test-only-ratification')],status:'RATIFIED'});
 const e=new GovernedTransferEvaluator(r);
 const event=(id,type,time)=>({id,transactionId:'order:1',type,occurredAt:time,evidenceIds:[eid(`evidence:${id}`)]});
 const before=e.evaluate({transactionId:'order:1',transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,events:[event('payment:1','SETTLEMENT','2026-09-11T15:01:00Z'),event('handover:1','HANDOVER','2026-09-11T15:02:00Z')]});
 assert.equal(before.titleTransferred,false);assert.equal(before.riskTransferred,false);
 const after=e.evaluate({transactionId:'order:1',transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,events:[event('payment:1','SETTLEMENT','2026-09-11T15:01:00Z'),event('handover:1','HANDOVER','2026-09-11T15:02:00Z'),event('acceptance:1','ACCEPTANCE','2026-09-11T15:03:00Z')]});
 assert.equal(after.titleTransferred,true);assert.equal(after.riskTransferred,true);assert.equal(after.titleEventId,'acceptance:1');assert.equal(after.riskEventId,'acceptance:1');
});

test('quantity-aware semantics remain mandatory after owner ratification while production gates stay closed',()=>{
 assert.match(policy,/Matching trigger quantities accumulate monotonically/i);
 assert.match(policy,/Partial acceptance transfers only accepted quantity/i);
 assert.match(policy,/legacy boolean evaluator.*MUST NOT be used as the production source of truth for partial-quantity title\/risk decisions/i);
 assert.match(policy,/quantity-aware transfer semantics to remain green under conformance and integrated pilot evidence/i);
 assert.match(policy,/Owner ratification does not by itself authorize production release or live-money\/fulfillment mutations/i);
});
