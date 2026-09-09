import type {AuthorityGrantId,EvidenceId,Participant,ParticipantId} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import type {EligibilityDecision,InMemoryMembershipStore,MembershipRelationship} from '../../membership/src/index.js';

export interface AuthenticatedPrincipal {
 readonly issuer:string;
 readonly subject:string;
 readonly authenticatedAt:string;
 readonly providerEvidenceId:EvidenceId;
 readonly assurance:'LOW'|'STANDARD'|'HIGH';
}

export interface IdentityBinding {
 readonly id:string;
 readonly issuer:string;
 readonly subject:string;
 readonly participantId:ParticipantId;
 readonly providerEvidenceId:EvidenceId;
 readonly boundAt:string;
 readonly boundBy:ParticipantId;
 readonly authorityGrantId:AuthorityGrantId;
}

export class InMemoryParticipantDirectory {
 private readonly participants=new Map<ParticipantId,Participant>();
 register(participant:Participant):Participant{
  if(this.participants.has(participant.id)) throw new Error('PARTICIPANT_ID_DUPLICATE');
  const frozen=Object.freeze({...participant});
  this.participants.set(participant.id,frozen);
  return frozen;
 }
 get(id:ParticipantId){ return this.participants.get(id); }
 require(id:ParticipantId){ const p=this.get(id); if(!p) throw new Error('PARTICIPANT_NOT_FOUND'); return p; }
}

export class InMemoryIdentityBindingStore {
 private readonly byExternalKey=new Map<string,IdentityBinding>();
 private readonly byId=new Map<string,IdentityBinding>();
 // JSON tuple encoding is injective for string issuer/subject pairs and avoids delimiter collisions.
 private key(issuer:string,subject:string){ return JSON.stringify([issuer,subject]); }
 bind(binding:IdentityBinding):IdentityBinding{
  if(!binding.issuer.trim() || !binding.subject.trim()) throw new Error('AUTH_IDENTITY_INVALID');
  if(this.byId.has(binding.id)) throw new Error('IDENTITY_BINDING_ID_DUPLICATE');
  const key=this.key(binding.issuer,binding.subject);
  if(this.byExternalKey.has(key)) throw new Error('AUTH_IDENTITY_ALREADY_BOUND');
  const frozen=Object.freeze({...binding});
  this.byId.set(binding.id,frozen);
  this.byExternalKey.set(key,frozen);
  return frozen;
 }
 resolve(principal:Pick<AuthenticatedPrincipal,'issuer'|'subject'>){ return this.byExternalKey.get(this.key(principal.issuer,principal.subject)); }
}

export interface AuthorizedIdentityCommand {
 readonly actorId:ParticipantId;
 readonly grantIds:readonly AuthorityGrantId[];
 readonly at:string;
}

export class PilotIdentityMembershipService {
 constructor(
  private readonly participants:InMemoryParticipantDirectory,
  private readonly bindings:InMemoryIdentityBindingStore,
  private readonly memberships:InMemoryMembershipStore,
  private readonly authority:AuthorityEvaluator
 ){}

 bindAuthenticatedIdentity(input:AuthorizedIdentityCommand & {
  bindingId:string;
  principal:AuthenticatedPrincipal;
  participantId:ParticipantId;
 }):IdentityBinding{
  this.participants.require(input.actorId);
  this.participants.require(input.participantId);
  if(Number.isNaN(Date.parse(input.principal.authenticatedAt)) || Number.isNaN(Date.parse(input.at))) throw new Error('AUTH_TIME_INVALID');
  if(Date.parse(input.principal.authenticatedAt)>Date.parse(input.at)) throw new Error('AUTHENTICATION_FROM_FUTURE');
  const decision=this.authority.evaluate({actorId:input.actorId,action:'identity.bind',targetId:String(input.participantId),at:input.at,grantIds:input.grantIds});
  if(!decision.allowed || !decision.grantId) throw new Error(`IDENTITY_BIND_UNAUTHORIZED:${decision.reason}`);
  return this.bindings.bind({
   id:input.bindingId,
   issuer:input.principal.issuer,
   subject:input.principal.subject,
   participantId:input.participantId,
   providerEvidenceId:input.principal.providerEvidenceId,
   boundAt:input.at,
   boundBy:input.actorId,
   authorityGrantId:decision.grantId
  });
 }

 establishVerifiedMembership(input:AuthorizedIdentityCommand & {
  membershipId:string;
  participantId:ParticipantId;
  decision:EligibilityDecision;
 }):MembershipRelationship{
  this.participants.require(input.actorId);
  this.participants.require(input.participantId);
  const authorityDecision=this.authority.evaluate({actorId:input.actorId,action:'membership.verify',targetId:input.membershipId,at:input.at,grantIds:input.grantIds});
  if(!authorityDecision.allowed) throw new Error(`MEMBERSHIP_VERIFY_UNAUTHORIZED:${authorityDecision.reason}`);
  return this.memberships.establish({id:input.membershipId,participantId:input.participantId,decision:input.decision,at:input.at});
 }

 resolveActiveMember(principal:AuthenticatedPrincipal):{participant:Participant;membership:MembershipRelationship}{
  if(!principal.issuer.trim()||!principal.subject.trim()||Number.isNaN(Date.parse(principal.authenticatedAt))) throw new Error('AUTH_PRINCIPAL_INVALID');
  const binding=this.bindings.resolve(principal);
  if(!binding) throw new Error('AUTH_IDENTITY_NOT_BOUND');
  // providerEvidenceId identifies the current authentication observation. A new login is expected
  // to carry new evidence; the exact issuer+subject tuple, not bind-time evidence identity, determines identity.
  const participant=this.participants.require(binding.participantId);
  const membership=this.memberships.byParticipant(binding.participantId).find(x=>x.state==='ACTIVE');
  if(!membership) throw new Error('ACTIVE_MEMBERSHIP_REQUIRED');
  return {participant,membership};
 }
}
