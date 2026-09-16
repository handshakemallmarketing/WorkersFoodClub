import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FoundingWorkerEligibilityPolicy,
  GovernedEligibilityDecisionStore,
  InMemoryMembershipStore
} from '../../dist/packages/membership/src/index.js';
import {InMemoryMemberApplicationStore,InMemoryBeneficiaryStore} from '../../dist/packages/membership/src/lifecycle.js';
import {InMemoryMembershipBillingStore} from '../../dist/packages/membership/src/billing.js';
import {InMemoryShoppingCreditStore} from '../../dist/packages/membership/src/credits.js';

const participant=id=>id;
const evidence=id=>id;
const at='2026-09-16T12:00:00Z';

function governedDecision(id='participant:a2-member'){
  const participantId=participant(id);
  const governed=new GovernedEligibilityDecisionStore();
  const policy=new FoundingWorkerEligibilityPolicy();
  const decision=governed.record(policy,{participantId,evidenceIds:[evidence('evidence:a2')],at,attributes:{workerClass:'PUBLIC_SECTOR',verified:true}});
  return {participantId,governed,decision};
}

test('A2 application cannot activate eligibility from an ungoverned decision',()=>{
  const {participantId,decision}=governedDecision();
  const applications=new InMemoryMemberApplicationStore();
  applications.create({id:'application:a2',legalName:'A2 Member',primaryContact:'member@example.test',eligibilityClass:'PUBLIC_SECTOR',eligibilityEvidenceIds:[evidence('evidence:a2')],communicationConsent:true,createdAt:at});
  applications.submit('application:a2',at);
  applications.beginReview('application:a2');
  const emptyGoverned=new GovernedEligibilityDecisionStore();
  assert.throws(()=>applications.approve('application:a2',decision,emptyGoverned),/ELIGIBILITY_DECISION_NOT_GOVERNED/);
  assert.equal(applications.get('application:a2').state,'UNDER_REVIEW');
  assert.equal(participantId,'participant:a2-member');
});

test('A2 membership rejects duplicate ACTIVE relationship for one participant',()=>{
  const {participantId,decision}=governedDecision();
  const memberships=new InMemoryMembershipStore();
  memberships.establish({id:'membership:a2-1',participantId,decision,at});
  assert.throws(()=>memberships.establish({id:'membership:a2-2',participantId,decision,at}),/ACTIVE_MEMBERSHIP_ALREADY_EXISTS/);
  assert.equal(memberships.byParticipant(participantId).filter(x=>x.state==='ACTIVE').length,1);
});

test('A2 beneficiary invitation fails closed for forged and expired tokens',()=>{
  const store=new InMemoryBeneficiaryStore();
  const policy={maxActiveBeneficiaries:2};
  store.invite({id:'beneficiary:a2-1',sponsorParticipantId:participant('participant:sponsor'),tokenDigest:'digest:real',invitedAt:'2026-09-16T12:00:00Z',expiresAt:'2026-09-17T12:00:00Z'},policy);
  assert.throws(()=>store.accept('beneficiary:a2-1','digest:forged',participant('participant:beneficiary'),'2026-09-16T13:00:00Z'),/BENEFICIARY_TOKEN_INVALID/);
  assert.throws(()=>store.accept('beneficiary:a2-1','digest:real',participant('participant:beneficiary'),'2026-09-17T12:00:00Z'),/BENEFICIARY_TOKEN_EXPIRED/);
  assert.equal(store.activeForSponsor(participant('participant:sponsor')).length,0);
});

test('A2 beneficiary activation enforces configured active-slot ceiling',()=>{
  const store=new InMemoryBeneficiaryStore();
  const sponsor=participant('participant:sponsor');
  const policy={maxActiveBeneficiaries:1};
  store.invite({id:'beneficiary:a2-1',sponsorParticipantId:sponsor,tokenDigest:'digest:1',invitedAt:'2026-09-16T12:00:00Z',expiresAt:'2026-09-17T12:00:00Z'},policy);
  store.accept('beneficiary:a2-1','digest:1',participant('participant:b1'),'2026-09-16T13:00:00Z');
  store.activate('beneficiary:a2-1','digest:1','2026-09-16T13:01:00Z',policy);
  assert.throws(()=>store.invite({id:'beneficiary:a2-2',sponsorParticipantId:sponsor,tokenDigest:'digest:2',invitedAt:'2026-09-16T14:00:00Z',expiresAt:'2026-09-17T14:00:00Z'},policy),/BENEFICIARY_SLOT_LIMIT/);
});

test('A2 annual membership fee rejects partial settlement and exact payment restores standing',()=>{
  const participantId=participant('participant:billing');
  const billing=new InMemoryMembershipBillingStore();
  const invoice=billing.issue({id:'invoice:a2',participantId,amountMinor:10000,issuedAt:'2026-09-01T00:00:00Z',dueAt:'2026-09-10T00:00:00Z'});
  assert.equal(invoice.nonRefundable,true);
  billing.markDue('invoice:a2');
  billing.markPastDue('invoice:a2','2026-09-11T00:00:00Z');
  assert.equal(billing.standing(participantId,true).state,'RESTRICTED');
  assert.throws(()=>billing.recordAuthoritativeSettlement('invoice:a2',{amountMinor:4000,reference:'settlement:a2-partial'}),/ANNUAL_MEMBERSHIP_FEE_FULL_PAYMENT_REQUIRED/);
  assert.equal(billing.standing(participantId,true).state,'RESTRICTED');
  const result=billing.recordAuthoritativeSettlement('invoice:a2',{amountMinor:10000,reference:'settlement:a2-full'});
  assert.equal(result.invoice.state,'SETTLED');
  assert.equal(result.invoice.settledMinor,10000);
  assert.equal(result.invoice.nonRefundable,true);
  assert.equal(result.overpaymentCreditMinor,0);
  assert.equal(billing.standing(participantId,true).state,'CURRENT');
});

test('A2 overpayment settles annual fee and records only excess as member-funded shopping credit',()=>{
  const participantId=participant('participant:overpayment');
  const credits=new InMemoryShoppingCreditStore();
  const billing=new InMemoryMembershipBillingStore(credits);
  billing.issue({id:'invoice:a2-over',participantId,amountMinor:10000,issuedAt:'2026-09-01T00:00:00Z',dueAt:'2026-09-10T00:00:00Z'});
  const result=billing.recordAuthoritativeSettlement('invoice:a2-over',{amountMinor:11000,reference:'settlement:a2-over',recordedAt:at});
  assert.equal(result.invoice.state,'SETTLED');
  assert.equal(result.invoice.settledMinor,10000);
  assert.equal(result.overpaymentCreditMinor,1000);
  const lot=credits.get(result.shoppingCreditLotId);
  assert.equal(lot.source,'MEMBERSHIP_OVERPAYMENT_CREDIT');
  assert.equal(lot.funding,'MEMBER_FUNDED');
  assert.equal(lot.issuedMinor,1000);
  assert.equal(lot.availableMinor,1000);
});

test('A2 Founding-1000 membership-fee spending credit equals annual fee and expires after one year',()=>{
  const participantId=participant('participant:founding');
  const credits=new InMemoryShoppingCreditStore();
  const lot=credits.issueMembershipFeeSpendingCredit({id:'credit:a2-founding',participantId,annualFeeMinor:10000,issuedAt:'2026-09-16T12:00:00Z',sourceReference:'membership-fee-credit:a2-founding'});
  assert.equal(lot.source,'MEMBERSHIP_FEE_SPENDING_CREDIT');
  assert.equal(lot.funding,'CLUB_FUNDED');
  assert.equal(lot.issuedMinor,10000);
  assert.equal(lot.expiresAt,'2027-09-16T12:00:00.000Z');
  assert.equal(credits.balanceBySource(participantId,'MEMBERSHIP_FEE_SPENDING_CREDIT','2027-09-15T12:00:00Z'),10000);
  assert.equal(credits.balanceBySource(participantId,'MEMBERSHIP_FEE_SPENDING_CREDIT','2027-09-16T12:00:00Z'),0);
});

test('A2 promotional credit remains independently campaign-attributable and source-reference idempotent',()=>{
  const participantId=participant('participant:promo');
  const credits=new InMemoryShoppingCreditStore();
  const first=credits.issuePromotionalCredit({id:'credit:a2-promo-1',participantId,amountMinor:2500,issuedAt:at,sourceReference:'promo:a2:grant-1',campaignReference:'campaign:a2-launch'});
  const replay=credits.issuePromotionalCredit({id:'credit:a2-promo-replay',participantId,amountMinor:9999,issuedAt:at,sourceReference:'promo:a2:grant-1',campaignReference:'campaign:a2-other'});
  assert.equal(first.source,'PROMOTIONAL_CREDIT');
  assert.equal(first.funding,'CLUB_FUNDED');
  assert.equal(first.campaignReference,'campaign:a2-launch');
  assert.equal(replay.id,first.id);
  assert.equal(credits.balanceBySource(participantId,'PROMOTIONAL_CREDIT'),2500);
});
