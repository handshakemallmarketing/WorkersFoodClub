import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {FoundingWorkerEligibilityPolicy,InMemoryMembershipStore} from '../../dist/packages/membership/src/index.js';
import {InMemoryParticipantDirectory,InMemoryIdentityBindingStore,PilotIdentityMembershipService} from '../../dist/packages/identity/src/index.js';

const pid=x=>asId(x), gid=x=>asId(x), eid=x=>asId(x);
const at='2026-09-08T12:00:00Z';

function setup(){
 const participants=new InMemoryParticipantDirectory();
 const authorityStore=new InMemoryAuthorityStore();
 const memberships=new InMemoryMembershipStore();
 const bindings=new InMemoryIdentityBindingStore();
 const operator=pid('participant:operator');
 const member=pid('participant:member');
 participants.register({id:operator,kind:'PERSON'});
 participants.register({id:member,kind:'PERSON'});
 authorityStore.put({id:gid('grant:identity'),grantorId:pid('participant:food-club'),actorId:operator,actions:['identity.bind'],targetPrefix:'participant:',validFrom:'2026-09-01T00:00:00Z'});
 authorityStore.put({id:gid('grant:membership'),grantorId:pid('participant:food-club'),actorId:operator,actions:['membership.verify'],targetPrefix:'membership:',validFrom:'2026-09-01T00:00:00Z'});
 const service=new PilotIdentityMembershipService(participants,bindings,memberships,new AuthorityEvaluator(authorityStore));
 return {participants,authorityStore,memberships,bindings,service,operator,member};
}

function principal(subject='user-123',evidence=`evidence:auth:${subject}`){
 return {issuer:'https://auth.example',subject,authenticatedAt:'2026-09-08T11:59:00Z',providerEvidenceId:eid(evidence),assurance:'STANDARD'};
}

test('SW1-01 external auth subject does not become Participant identity implicitly',()=>{const {bindings}=setup();assert.equal(bindings.resolve(principal()),undefined);});
test('SW1-01 identity binding requires real delegated authority',()=>{const {service,operator,member}=setup();assert.throws(()=>service.bindAuthenticatedIdentity({bindingId:'binding:1',principal:principal(),participantId:member,actorId:operator,grantIds:[],at}),/IDENTITY_BIND_UNAUTHORIZED:NO_GRANT/);const binding=service.bindAuthenticatedIdentity({bindingId:'binding:1',principal:principal(),participantId:member,actorId:operator,grantIds:[gid('grant:identity')],at});assert.equal(binding.participantId,member);assert.notEqual(principal().subject,String(member));});
test('SW1-01 same provider identity cannot be rebound to another Participant',()=>{const {service,participants,operator,member}=setup();const other=pid('participant:other');participants.register({id:other,kind:'PERSON'});service.bindAuthenticatedIdentity({bindingId:'binding:1',principal:principal(),participantId:member,actorId:operator,grantIds:[gid('grant:identity')],at});assert.throws(()=>service.bindAuthenticatedIdentity({bindingId:'binding:2',principal:principal(),participantId:other,actorId:operator,grantIds:[gid('grant:identity')],at}),/AUTH_IDENTITY_ALREADY_BOUND/);});
test('SW1-01 revoked operator authority rejects later membership verification',()=>{const {service,authorityStore,operator,member}=setup();const policy=new FoundingWorkerEligibilityPolicy();const decision=policy.evaluate({participantId:member,evidenceIds:[eid('evidence:employment')],at,attributes:{workerClass:'PUBLIC_SECTOR',verified:true}});authorityStore.revoke(gid('grant:membership'),'2026-09-08T11:00:00Z');assert.throws(()=>service.establishVerifiedMembership({membershipId:'membership:1',participantId:member,decision,actorId:operator,grantIds:[gid('grant:membership')],at}),/MEMBERSHIP_VERIFY_UNAUTHORIZED:REVOKED/);});
test('SW1-01 active authenticated member requires both binding and active membership',()=>{const {service,memberships,operator,member}=setup();const p=principal();service.bindAuthenticatedIdentity({bindingId:'binding:1',principal:p,participantId:member,actorId:operator,grantIds:[gid('grant:identity')],at});assert.throws(()=>service.resolveActiveMember(p),/ACTIVE_MEMBERSHIP_REQUIRED/);const policy=new FoundingWorkerEligibilityPolicy();const decision=policy.evaluate({participantId:member,evidenceIds:[eid('evidence:employment')],at,attributes:{workerClass:'PUBLIC_SECTOR',verified:true}});service.establishVerifiedMembership({membershipId:'membership:1',participantId:member,decision,actorId:operator,grantIds:[gid('grant:membership')],at});assert.equal(service.resolveActiveMember(p).participant.id,member);memberships.suspend('membership:1');assert.throws(()=>service.resolveActiveMember(p),/ACTIVE_MEMBERSHIP_REQUIRED/);});
test('SW1-04A same issuer and subject may re-authenticate with fresh provider evidence',()=>{const {service,operator,member}=setup();const first=principal('user-123','evidence:auth:first-login');service.bindAuthenticatedIdentity({bindingId:'binding:1',principal:first,participantId:member,actorId:operator,grantIds:[gid('grant:identity')],at});const policy=new FoundingWorkerEligibilityPolicy();const decision=policy.evaluate({participantId:member,evidenceIds:[eid('evidence:employment')],at,attributes:{workerClass:'PUBLIC_SECTOR',verified:true}});service.establishVerifiedMembership({membershipId:'membership:1',participantId:member,decision,actorId:operator,grantIds:[gid('grant:membership')],at});const second={...principal('user-123','evidence:auth:second-login'),authenticatedAt:'2026-09-08T12:30:00Z'};assert.equal(service.resolveActiveMember(second).participant.id,member);assert.throws(()=>service.resolveActiveMember({...second,issuer:'https://evil.example'}),/AUTH_IDENTITY_NOT_BOUND/);});
test('SW1-04A issuer-subject tuple encoding cannot collide on delimiter-like content',()=>{const {bindings}=setup();const first={id:'binding:a',issuer:'https://auth.example/a',subject:'b::c',participantId:pid('participant:a'),providerEvidenceId:eid('evidence:a'),boundAt:at,boundBy:pid('participant:operator'),authorityGrantId:gid('grant:identity')};const second={id:'binding:b',issuer:'https://auth.example/a::b',subject:'c',participantId:pid('participant:b'),providerEvidenceId:eid('evidence:b'),boundAt:at,boundBy:pid('participant:operator'),authorityGrantId:gid('grant:identity')};bindings.bind(first);bindings.bind(second);assert.equal(bindings.resolve({issuer:first.issuer,subject:first.subject})?.participantId,first.participantId);assert.equal(bindings.resolve({issuer:second.issuer,subject:second.subject})?.participantId,second.participantId);});
