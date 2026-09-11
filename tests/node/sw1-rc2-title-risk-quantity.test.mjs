import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {GovernedTransferPolicyRegistry,GovernedTransferEvaluator} from '../../dist/packages/transfer/src/index.js';

const pid=x=>asId(x);const eid=x=>asId(x);const gid=x=>asId(x);
const policy={id:'GH-PILOT-TITLE-RISK',version:1,transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',title:{dimension:'TITLE',trigger:'ACCEPTANCE'},risk:{dimension:'RISK',trigger:'ACCEPTANCE'},effectiveFrom:'2026-09-11T15:00:00Z',authorizedBy:pid('participant:board'),authorityGrantId:'grant:gh-pilot-transfer',evidenceIds:[eid('evidence:test-ratification')],status:'RATIFIED'};
const evaluator=()=>{const s=new InMemoryAuthorityStore();s.put({id:gid('grant:gh-pilot-transfer'),grantorId:pid('participant:founder'),actorId:pid('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'GH-PILOT-TITLE-RISK',validFrom:'2026-09-01T00:00:00Z'});const r=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(s),()=> '2026-09-11T15:00:00Z');r.ratify(policy);return new GovernedTransferEvaluator(r);};
const event=(id,type,time,amount)=>({id,transactionId:'order:partial:1',type,occurredAt:time,evidenceIds:[eid(`evidence:${id}`)],...(amount===undefined?{}:{quantity:quantity(amount,'kg')})});

test('RC2-LEGAL-001 partial acceptance transfers title and risk only for accepted quantity',()=>{
 const result=evaluator().evaluateQuantities({transactionId:'order:partial:1',transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,totalQuantity:quantity(10,'kg'),events:[event('settlement:1','SETTLEMENT','2026-09-11T15:01:00Z',10),event('handover:1','HANDOVER','2026-09-11T15:02:00Z',10),event('acceptance:1','ACCEPTANCE','2026-09-11T15:03:00Z',8),event('exception:1','FULFILLMENT_EXCEPTION','2026-09-11T15:04:00Z',2)]});
 assert.equal(result.titleTransferredQuantity.amount,8);assert.equal(result.riskTransferredQuantity.amount,8);assert.equal(result.titleComplete,false);assert.equal(result.riskComplete,false);assert.deepEqual(result.titleEventIds,['acceptance:1']);assert.deepEqual(result.riskEventIds,['acceptance:1']);
});

test('replacement acceptance may complete remaining governed quantity without rewriting history',()=>{
 const result=evaluator().evaluateQuantities({transactionId:'order:partial:1',transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,totalQuantity:quantity(10,'kg'),events:[event('acceptance:1','ACCEPTANCE','2026-09-11T15:03:00Z',8),event('exception:1','FULFILLMENT_EXCEPTION','2026-09-11T15:04:00Z',2),event('replacement-acceptance:1','ACCEPTANCE','2026-09-11T16:00:00Z',2)]});
 assert.equal(result.titleTransferredQuantity.amount,10);assert.equal(result.riskTransferredQuantity.amount,10);assert.equal(result.titleComplete,true);assert.equal(result.riskComplete,true);assert.deepEqual(result.titleEventIds,['acceptance:1','replacement-acceptance:1']);
});

test('non-trigger exception or refund events never increase transferred quantity',()=>{
 const result=evaluator().evaluateQuantities({transactionId:'order:partial:1',transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,totalQuantity:quantity(10,'kg'),events:[event('acceptance:1','ACCEPTANCE','2026-09-11T15:03:00Z',8),event('exception:1','FULFILLMENT_EXCEPTION','2026-09-11T15:04:00Z',2),event('refund:1','REMEDY_COMPLETION','2026-09-11T16:00:00Z',2)]});
 assert.equal(result.titleTransferredQuantity.amount,8);assert.equal(result.riskTransferredQuantity.amount,8);
});

test('quantity transfer fails closed on missing quantity, wrong units, duplicate events and over-transfer',()=>{
 const e=evaluator();const base={transactionId:'order:partial:1',transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,totalQuantity:quantity(10,'kg')};
 assert.throws(()=>e.evaluateQuantities({...base,events:[event('acceptance:missing','ACCEPTANCE','2026-09-11T15:03:00Z')]}),/TRANSFER_TRIGGER_QUANTITY_REQUIRED/);
 assert.throws(()=>e.evaluateQuantities({...base,events:[{...event('acceptance:unit','ACCEPTANCE','2026-09-11T15:03:00Z',8),quantity:quantity(8,'unit')}]}),/TRANSFER_QUANTITY_UNIT_MISMATCH/);
 const duplicate=event('acceptance:dup','ACCEPTANCE','2026-09-11T15:03:00Z',5);assert.throws(()=>e.evaluateQuantities({...base,events:[duplicate,duplicate]}),/TRANSFER_EVENT_ID_DUPLICATE/);
 assert.throws(()=>e.evaluateQuantities({...base,events:[event('acceptance:1','ACCEPTANCE','2026-09-11T15:03:00Z',8),event('acceptance:2','ACCEPTANCE','2026-09-11T15:04:00Z',3)]}),/TRANSFER_QUANTITY_EXCEEDS_TOTAL/);
});

test('legacy transaction-level evaluation remains backward compatible',()=>{
 const result=evaluator().evaluate({transactionId:'order:partial:1',transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,events:[event('acceptance:1','ACCEPTANCE','2026-09-11T15:03:00Z',8)]});
 assert.equal(result.titleTransferred,true);assert.equal(result.riskTransferred,true);assert.equal(result.titleEventId,'acceptance:1');
});
