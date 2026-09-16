import type {EvidenceId,ParticipantId} from '../../kernel/src/index.js';
import type {EligibilityDecision,GovernedEligibilityDecisionStore} from './index.js';

export type MemberApplicationState='DRAFT'|'SUBMITTED'|'UNDER_REVIEW'|'APPROVED'|'REJECTED'|'WITHDRAWN';
export interface MemberApplication {
 readonly id:string;
 readonly legalName:string;
 readonly primaryContact:string;
 readonly eligibilityClass:string;
 readonly eligibilityEvidenceIds:readonly EvidenceId[];
 readonly communicationConsent:boolean;
 readonly state:MemberApplicationState;
 readonly createdAt:string;
 readonly submittedAt?:string;
 readonly decision?:EligibilityDecision;
}

export class InMemoryMemberApplicationStore {
 private readonly applications=new Map<string,MemberApplication>();
 create(input:Omit<MemberApplication,'state'>):MemberApplication{
  if(this.applications.has(input.id)) throw new Error('MEMBER_APPLICATION_ID_DUPLICATE');
  if(!input.legalName.trim()||!input.primaryContact.trim()||!input.eligibilityClass.trim()) throw new Error('MEMBER_APPLICATION_CORE_FIELDS_REQUIRED');
  if(input.eligibilityEvidenceIds.length===0) throw new Error('MEMBER_APPLICATION_ELIGIBILITY_EVIDENCE_REQUIRED');
  const record=this.freeze({...input,state:'DRAFT' as const}); this.applications.set(record.id,record); return record;
 }
 submit(id:string,at:string):MemberApplication{
  const current=this.require(id); if(current.state!=='DRAFT') throw new Error('MEMBER_APPLICATION_NOT_DRAFT');
  if(!current.communicationConsent) throw new Error('MEMBER_APPLICATION_CONSENT_REQUIRED');
  return this.replace({...current,state:'SUBMITTED',submittedAt:at});
 }
 beginReview(id:string):MemberApplication{
  const current=this.require(id); if(current.state!=='SUBMITTED') throw new Error('MEMBER_APPLICATION_NOT_SUBMITTED');
  return this.replace({...current,state:'UNDER_REVIEW'});
 }
 approve(id:string,decision:EligibilityDecision,governed:GovernedEligibilityDecisionStore):MemberApplication{
  const current=this.require(id); if(current.state!=='UNDER_REVIEW') throw new Error('MEMBER_APPLICATION_NOT_UNDER_REVIEW');
  const verified=governed.requireGoverned(decision); if(!verified.eligible) throw new Error('MEMBER_APPLICATION_REQUIRES_ELIGIBILITY');
  return this.replace({...current,state:'APPROVED',decision:verified});
 }
 reject(id:string):MemberApplication{
  const current=this.require(id); if(current.state!=='UNDER_REVIEW') throw new Error('MEMBER_APPLICATION_NOT_UNDER_REVIEW');
  return this.replace({...current,state:'REJECTED'});
 }
 withdraw(id:string):MemberApplication{
  const current=this.require(id); if(current.state==='APPROVED'||current.state==='REJECTED'||current.state==='WITHDRAWN') throw new Error('MEMBER_APPLICATION_TERMINAL');
  return this.replace({...current,state:'WITHDRAWN'});
 }
 requireApproved(id:string):MemberApplication{ const a=this.require(id); if(a.state!=='APPROVED'||!a.decision) throw new Error('APPROVED_MEMBER_APPLICATION_REQUIRED'); return a; }
 get(id:string){return this.applications.get(id);}
 private require(id:string){const a=this.applications.get(id);if(!a)throw new Error('MEMBER_APPLICATION_NOT_FOUND');return a;}
 private replace(value:MemberApplication){const frozen=this.freeze(value);this.applications.set(value.id,frozen);return frozen;}
 private freeze<T extends MemberApplication>(value:T):MemberApplication{return Object.freeze({...value,eligibilityEvidenceIds:Object.freeze([...value.eligibilityEvidenceIds])});}
}

export type BeneficiaryInvitationState='INVITED'|'ACCEPTED'|'ACTIVATED'|'REVOKED'|'EXPIRED';
export interface BeneficiaryInvitation {
 readonly id:string;
 readonly sponsorParticipantId:ParticipantId;
 readonly beneficiaryParticipantId?:ParticipantId;
 readonly tokenDigest:string;
 readonly state:BeneficiaryInvitationState;
 readonly invitedAt:string;
 readonly expiresAt:string;
 readonly acceptedAt?:string;
 readonly activatedAt?:string;
}
export interface BeneficiarySlotPolicy { readonly maxActiveBeneficiaries:number; }

export class InMemoryBeneficiaryStore {
 private readonly invitations=new Map<string,BeneficiaryInvitation>();
 invite(input:{id:string;sponsorParticipantId:ParticipantId;tokenDigest:string;invitedAt:string;expiresAt:string},policy:BeneficiarySlotPolicy):BeneficiaryInvitation{
  if(this.invitations.has(input.id)) throw new Error('BENEFICIARY_INVITATION_ID_DUPLICATE');
  if(!input.tokenDigest.trim()) throw new Error('BENEFICIARY_TOKEN_DIGEST_REQUIRED');
  if(Date.parse(input.expiresAt)<=Date.parse(input.invitedAt)) throw new Error('BENEFICIARY_EXPIRY_INVALID');
  if(this.activeCount(input.sponsorParticipantId)>=policy.maxActiveBeneficiaries) throw new Error('BENEFICIARY_SLOT_LIMIT');
  const value=Object.freeze({...input,state:'INVITED' as const});this.invitations.set(input.id,value);return value;
 }
 accept(id:string,tokenDigest:string,beneficiaryParticipantId:ParticipantId,at:string):BeneficiaryInvitation{
  const current=this.require(id); this.requireUsable(current,tokenDigest,at); if(current.state!=='INVITED') throw new Error('BENEFICIARY_INVITATION_NOT_INVITED');
  return this.replace({...current,state:'ACCEPTED',beneficiaryParticipantId,acceptedAt:at});
 }
 activate(id:string,tokenDigest:string,at:string,policy:BeneficiarySlotPolicy):BeneficiaryInvitation{
  const current=this.require(id);this.requireUsable(current,tokenDigest,at);if(current.state!=='ACCEPTED'||!current.beneficiaryParticipantId) throw new Error('BENEFICIARY_INVITATION_NOT_ACCEPTED');
  if(this.activeCount(current.sponsorParticipantId)>=policy.maxActiveBeneficiaries) throw new Error('BENEFICIARY_SLOT_LIMIT');
  return this.replace({...current,state:'ACTIVATED',activatedAt:at});
 }
 revoke(id:string):BeneficiaryInvitation{const current=this.require(id);if(current.state==='REVOKED'||current.state==='EXPIRED')return current;return this.replace({...current,state:'REVOKED'});}
 activeForSponsor(id:ParticipantId){return [...this.invitations.values()].filter(x=>x.sponsorParticipantId===id&&x.state==='ACTIVATED');}
 private activeCount(id:ParticipantId){return this.activeForSponsor(id).length;}
 private requireUsable(i:BeneficiaryInvitation,digest:string,at:string){if(i.tokenDigest!==digest)throw new Error('BENEFICIARY_TOKEN_INVALID');if(Date.parse(at)>=Date.parse(i.expiresAt))throw new Error('BENEFICIARY_TOKEN_EXPIRED');}
 private require(id:string){const x=this.invitations.get(id);if(!x)throw new Error('BENEFICIARY_INVITATION_NOT_FOUND');return x;}
 private replace(value:BeneficiaryInvitation){const frozen=Object.freeze({...value});this.invitations.set(value.id,frozen);return frozen;}
}
