import type {EvidenceId,ParticipantId} from '../../kernel/src/index.js';

export type MembershipState='ACTIVE'|'SUSPENDED'|'ENDED';

export interface EligibilityDecision {
 readonly participantId:ParticipantId;
 readonly eligible:boolean;
 readonly policyVersion:string;
 readonly evidenceIds:readonly EvidenceId[];
 readonly evaluatedAt:string;
 readonly reason:string;
}

export interface MembershipRelationship {
 readonly id:string;
 readonly participantId:ParticipantId;
 readonly state:MembershipState;
 readonly establishedAt:string;
 readonly eligibilityPolicyVersion:string;
 readonly eligibilityEvidenceIds:readonly EvidenceId[];
 readonly endedAt?:string;
}

export interface EligibilityPolicy {
 readonly version:string;
 evaluate(input:{participantId:ParticipantId;evidenceIds:readonly EvidenceId[];at:string;attributes:Readonly<Record<string,string|number|boolean>>}):EligibilityDecision;
}

const eligibilityKey=(decision:EligibilityDecision)=>JSON.stringify({participantId:String(decision.participantId),eligible:decision.eligible,policyVersion:decision.policyVersion,evidenceIds:[...decision.evidenceIds].map(String),evaluatedAt:decision.evaluatedAt,reason:decision.reason});

export class GovernedEligibilityDecisionStore {
 private readonly decisions=new Map<string,EligibilityDecision>();
 record(policy:EligibilityPolicy,input:{participantId:ParticipantId;evidenceIds:readonly EvidenceId[];at:string;attributes:Readonly<Record<string,string|number|boolean>>}):EligibilityDecision{
  if(input.evidenceIds.length===0) throw new Error('ELIGIBILITY_EVIDENCE_REQUIRED');
  if(input.evidenceIds.some(x=>!String(x).trim())) throw new Error('ELIGIBILITY_EVIDENCE_INVALID');
  if(Number.isNaN(Date.parse(input.at))) throw new Error('ELIGIBILITY_TIME_INVALID');
  const decision=policy.evaluate({...input,evidenceIds:Object.freeze([...input.evidenceIds])});
  if(decision.policyVersion!==policy.version) throw new Error('ELIGIBILITY_POLICY_VERSION_MISMATCH');
  const frozen:EligibilityDecision=Object.freeze({...decision,evidenceIds:Object.freeze([...decision.evidenceIds])});
  this.decisions.set(eligibilityKey(frozen),frozen);
  return frozen;
 }
 requireGoverned(decision:EligibilityDecision):EligibilityDecision{
  const governed=this.decisions.get(eligibilityKey(decision));
  if(!governed) throw new Error('ELIGIBILITY_DECISION_NOT_GOVERNED');
  return governed;
 }
}

export class FoundingWorkerEligibilityPolicy implements EligibilityPolicy {
 readonly version:string;
 constructor(version='founding-worker-v1'){ this.version=version; }
 evaluate(input:{participantId:ParticipantId;evidenceIds:readonly EvidenceId[];at:string;attributes:Readonly<Record<string,string|number|boolean>>}):EligibilityDecision{
  const workerClass=input.attributes['workerClass'];
  const verified=input.attributes['verified']===true;
  const allowed=workerClass==='PUBLIC_SECTOR' || workerClass==='APPROVED_INSTITUTION';
  return Object.freeze({participantId:input.participantId,eligible:verified&&allowed,policyVersion:this.version,evidenceIds:Object.freeze([...input.evidenceIds]),evaluatedAt:input.at,reason:verified&&allowed?'ELIGIBLE':'ELIGIBILITY_NOT_PROVEN'});
 }
}

export class InMemoryMembershipStore {
 private readonly relationships=new Map<string,MembershipRelationship>();
 establish(input:{id:string;participantId:ParticipantId;decision:EligibilityDecision;at:string}):MembershipRelationship{
  if(this.relationships.has(input.id)) throw new Error('MEMBERSHIP_ID_DUPLICATE');
  if(this.byParticipant(input.participantId).some(x=>x.state==='ACTIVE')) throw new Error('ACTIVE_MEMBERSHIP_ALREADY_EXISTS');
  if(!input.decision.eligible) throw new Error('MEMBERSHIP_REQUIRES_ELIGIBILITY');
  if(input.decision.participantId!==input.participantId) throw new Error('ELIGIBILITY_PARTICIPANT_MISMATCH');
  if(input.decision.evidenceIds.length===0) throw new Error('MEMBERSHIP_ELIGIBILITY_EVIDENCE_REQUIRED');
  const membership:MembershipRelationship=Object.freeze({id:input.id,participantId:input.participantId,state:'ACTIVE',establishedAt:input.at,eligibilityPolicyVersion:input.decision.policyVersion,eligibilityEvidenceIds:Object.freeze([...input.decision.evidenceIds])});
  this.relationships.set(input.id,membership); return membership;
 }
 get(id:string){ return this.relationships.get(id); }
 byParticipant(participantId:ParticipantId){ return [...this.relationships.values()].filter(x=>x.participantId===participantId); }
 suspend(id:string):MembershipRelationship{ const m=this.require(id); const next=Object.freeze({...m,state:'SUSPENDED' as const}); this.relationships.set(id,next); return next; }
 end(id:string,at:string):MembershipRelationship{ const m=this.require(id); const next=Object.freeze({...m,state:'ENDED' as const,endedAt:at}); this.relationships.set(id,next); return next; }
 private require(id:string){ const m=this.relationships.get(id); if(!m) throw new Error('MEMBERSHIP_NOT_FOUND'); return m; }
}
