import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {GovernedTransferPolicyRegistry} from '../../dist/packages/transfer/src/index.js';
import {GovernedTransferApprovalStore,DecisionBoundTransferPolicyRatifier} from '../../dist/packages/transfer-governance/src/index.js';

const id=x=>asId(x);
const grant=JSON.parse(fs.readFileSync(new URL('../../docs/governance/GH-PILOT-TITLE-RISK-v1-authority-grant.json',import.meta.url),'utf8'));
const approval=JSON.parse(fs.readFileSync(new URL('../../docs/governance/GH-PILOT-TITLE-RISK-v1-governance-approval.json',import.meta.url),'utf8'));

function setup({revoke=false}={}){
 const authorities=new InMemoryAuthorityStore();
 authorities.put({id:id(grant.id),grantorId:id(grant.grantorId),actorId:id(grant.actorId),actions:grant.actions,targetPrefix:grant.targetPrefix,validFrom:grant.validFrom});
 if(revoke) authorities.revoke(id(grant.id),'2026-09-11T19:34:00Z');
 const registry=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(authorities),()=> '2026-09-11T19:35:00Z');
 const approvals=new GovernedTransferApprovalStore();
 approvals.put({...approval,authorizedBy:id(approval.authorizedBy),evidenceIds:approval.evidenceIds.map(id)});
 return {registry,ratifier:new DecisionBoundTransferPolicyRatifier(registry,approvals)};
}

function policy(overrides={}){
 return {
  id:'GH-PILOT-TITLE-RISK',version:1,transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',
  title:{dimension:'TITLE',trigger:'ACCEPTANCE'},risk:{dimension:'RISK',trigger:'ACCEPTANCE'},
  effectiveFrom:'2026-09-11T19:33:00Z',authorizedBy:id('participant:willie-adofo'),
  authorityGrantId:'grant:willie-adofo:transfer-policy-governance:v1',
  evidenceIds:[id('evidence:gh-pilot-title-risk-v1-ratification')],status:'RATIFIED',...overrides
 };
}

test('ratified v1 binds to Willie Adofo governance actor and exact authority grant',()=>{
 const {registry,ratifier}=setup();
 ratifier.ratify(policy());
 const saved=registry.get('GH-PILOT-TITLE-RISK',1);
 assert.equal(saved.authorizedBy,'participant:willie-adofo');
 assert.equal(saved.authorityGrantId,'grant:willie-adofo:transfer-policy-governance:v1');
 assert.equal(saved.title.trigger,'ACCEPTANCE');
 assert.equal(saved.risk.trigger,'ACCEPTANCE');
});

test('impersonation cannot inherit Willie Adofo governance approval',()=>{
 const {ratifier}=setup();
 assert.throws(()=>ratifier.ratify(policy({authorizedBy:id('participant:attacker')})),/TRANSFER_GOVERNANCE_APPROVAL_MISMATCH/);
});

test('cross-policy scope cannot inherit the approval',()=>{
 const {ratifier}=setup();
 assert.throws(()=>ratifier.ratify(policy({id:'GH-PILOT-OTHER-POLICY'})),/TRANSFER_GOVERNANCE_APPROVAL_REQUIRED/);
});

test('altered transfer semantics cannot inherit v1 approval',()=>{
 const {ratifier}=setup();
 assert.throws(()=>ratifier.ratify(policy({risk:{dimension:'RISK',trigger:'HANDOVER'}})),/TRANSFER_GOVERNANCE_APPROVAL_MISMATCH/);
});

test('later version cannot inherit v1 approval',()=>{
 const {ratifier}=setup();
 assert.throws(()=>ratifier.ratify(policy({version:2})),/TRANSFER_GOVERNANCE_APPROVAL_REQUIRED/);
});

test('revoked authority fails closed even with valid decision evidence',()=>{
 const {ratifier}=setup({revoke:true});
 assert.throws(()=>ratifier.ratify(policy()),/TRANSFER_POLICY_UNAUTHORIZED/);
});

test('ratification evidence must be bound to the exact approved decision',()=>{
 const {ratifier}=setup();
 assert.throws(()=>ratifier.ratify(policy({evidenceIds:[id('evidence:unrelated')]})),/TRANSFER_GOVERNANCE_APPROVAL_EVIDENCE_NOT_BOUND/);
});
