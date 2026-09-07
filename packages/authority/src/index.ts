import type {AuthorityGrantId,ConstraintId,ParticipantId} from '../../kernel/src/index.js';

export interface AuthorityGrant {
 readonly id:AuthorityGrantId;
 readonly grantorId:ParticipantId;
 readonly actorId:ParticipantId;
 readonly actions:readonly string[];
 readonly targetPrefix?:string;
 readonly validFrom:string;
 readonly validUntil?:string;
 readonly revokedAt?:string;
 readonly maxQuantity?:number;
 readonly parentGrantId?:AuthorityGrantId;
}

export interface AuthorityConstraint {
 readonly id:ConstraintId;
 readonly kind:'HOLD'|'STOP';
 readonly reason:string;
 readonly action?:string;
 readonly targetPrefix?:string;
 readonly activeFrom:string;
 readonly releasedAt?:string;
}

export type AuthorityReason =
 | 'ALLOWED'|'NO_GRANT'|'ACTOR_MISMATCH'|'ACTION_OUT_OF_SCOPE'|'TARGET_OUT_OF_SCOPE'
 | 'NOT_YET_VALID'|'EXPIRED'|'REVOKED'|'LIMIT_EXCEEDED'|'LIMIT_CONTEXT_REQUIRED'
 | 'DELEGATION_INVALID'|'HOLD_ACTIVE'|'STOP_ACTIVE'|'INVALID_TIME';
export interface AuthorityDecision { readonly allowed:boolean; readonly reason:AuthorityReason; readonly grantId?:AuthorityGrantId; readonly constraintId?:ConstraintId }
export interface AuthorityRequest { actorId:ParticipantId; action:string; targetId?:string; at:string; quantity?:number; grantIds:readonly AuthorityGrantId[] }

const subset=(child:readonly string[],parent:readonly string[])=>child.every(x=>parent.includes(x));
const prefixNarrows=(child:string|undefined,parent:string|undefined)=>!parent || (!!child && child.startsWith(parent));
const timeValue=(value:string,error='TIME_INVALID')=>{ const n=Date.parse(value); if(Number.isNaN(n)) throw new Error(error); return n; };
const isGrantActiveAt=(g:AuthorityGrant,at:number)=>
 at>=timeValue(g.validFrom,'GRANT_TIME_INVALID') &&
 (!g.validUntil || at<=timeValue(g.validUntil,'GRANT_TIME_INVALID')) &&
 (!g.revokedAt || at<timeValue(g.revokedAt,'GRANT_TIME_INVALID'));

export class InMemoryAuthorityStore {
 private grants=new Map<AuthorityGrantId,AuthorityGrant>();
 put(g:AuthorityGrant){
  if(this.grants.has(g.id)) throw new Error('GRANT_ID_DUPLICATE');
  const validFrom=timeValue(g.validFrom,'GRANT_TIME_INVALID');
  if(g.validUntil && timeValue(g.validUntil,'GRANT_TIME_INVALID')<validFrom) throw new Error('GRANT_TIME_RANGE_INVALID');
  if(g.revokedAt) timeValue(g.revokedAt,'GRANT_TIME_INVALID');
  if(g.maxQuantity!==undefined && (!Number.isFinite(g.maxQuantity)||g.maxQuantity<0)) throw new Error('GRANT_LIMIT_INVALID');
  if(g.parentGrantId){
   const p=this.grants.get(g.parentGrantId); if(!p) throw new Error('PARENT_GRANT_NOT_FOUND');
   if(p.actorId!==g.grantorId) throw new Error('DELEGATION_GRANTOR_MISMATCH');
   if(!subset(g.actions,p.actions)) throw new Error('DELEGATION_ACTION_ESCALATION');
   if(!prefixNarrows(g.targetPrefix,p.targetPrefix)) throw new Error('DELEGATION_TARGET_ESCALATION');
   if(validFrom<timeValue(p.validFrom,'GRANT_TIME_INVALID')) throw new Error('DELEGATION_TIME_ESCALATION');
   if(p.validUntil && (!g.validUntil || timeValue(g.validUntil,'GRANT_TIME_INVALID')>timeValue(p.validUntil,'GRANT_TIME_INVALID'))) throw new Error('DELEGATION_TIME_ESCALATION');
   if(p.maxQuantity!==undefined && (g.maxQuantity===undefined || g.maxQuantity>p.maxQuantity)) throw new Error('DELEGATION_LIMIT_ESCALATION');
   if(!isGrantActiveAt(p,validFrom)) throw new Error('DELEGATION_PARENT_INACTIVE');
  }
  this.grants.set(g.id,Object.freeze({...g}));
 }
 revoke(id:AuthorityGrantId,at:string){ const g=this.grants.get(id); if(!g) throw new Error('GRANT_NOT_FOUND'); timeValue(at,'GRANT_TIME_INVALID'); this.grants.set(id,Object.freeze({...g,revokedAt:at})); }
 get(id:AuthorityGrantId){ return this.grants.get(id); }
}

export class InMemoryConstraintStore {
 private constraints=new Map<ConstraintId,AuthorityConstraint>();
 put(c:AuthorityConstraint){
  if(this.constraints.has(c.id)) throw new Error('CONSTRAINT_ID_DUPLICATE');
  timeValue(c.activeFrom,'CONSTRAINT_TIME_INVALID');
  if(c.releasedAt) timeValue(c.releasedAt,'CONSTRAINT_TIME_INVALID');
  this.constraints.set(c.id,Object.freeze({...c}));
 }
 release(id:ConstraintId,at:string){ const c=this.constraints.get(id); if(!c) throw new Error('CONSTRAINT_NOT_FOUND'); timeValue(at,'CONSTRAINT_TIME_INVALID'); this.constraints.set(id,Object.freeze({...c,releasedAt:at})); }
 activeFor(r:AuthorityRequest):AuthorityConstraint|undefined{
  const at=Date.parse(r.at); if(Number.isNaN(at)) return undefined;
  let hold:AuthorityConstraint|undefined;
  for(const c of this.constraints.values()){
   if(at<timeValue(c.activeFrom,'CONSTRAINT_TIME_INVALID')) continue;
   if(c.releasedAt && at>=timeValue(c.releasedAt,'CONSTRAINT_TIME_INVALID')) continue;
   if(c.action && c.action!==r.action) continue;
   if(c.targetPrefix && (!r.targetId || !r.targetId.startsWith(c.targetPrefix))) continue;
   if(c.kind==='STOP') return c;
   hold??=c;
  }
  return hold;
 }
}

export class AuthorityEvaluator {
 constructor(private readonly store:InMemoryAuthorityStore, private readonly constraints?:InMemoryConstraintStore){}
 private delegationChainActive(g:AuthorityGrant,at:number,seen=new Set<AuthorityGrantId>()):boolean{
  if(!g.parentGrantId) return true;
  if(seen.has(g.id)) return false;
  seen.add(g.id);
  const p=this.store.get(g.parentGrantId);
  if(!p || !isGrantActiveAt(p,at)) return false;
  return this.delegationChainActive(p,at,seen);
 }
 evaluate(r:AuthorityRequest):AuthorityDecision{
  const at=Date.parse(r.at); if(Number.isNaN(at)) return {allowed:false,reason:'INVALID_TIME'};
  const c=this.constraints?.activeFor(r);
  if(c) return {allowed:false,reason:c.kind==='STOP'?'STOP_ACTIVE':'HOLD_ACTIVE',constraintId:c.id};
  if(r.grantIds.length===0) return {allowed:false,reason:'NO_GRANT'};
  let last:AuthorityDecision={allowed:false,reason:'NO_GRANT'};
  for(const id of r.grantIds){
   const g=this.store.get(id); if(!g){last={allowed:false,reason:'NO_GRANT'};continue;}
   if(g.actorId!==r.actorId){last={allowed:false,reason:'ACTOR_MISMATCH'};continue;}
   if(!g.actions.includes(r.action)){last={allowed:false,reason:'ACTION_OUT_OF_SCOPE'};continue;}
   if(g.targetPrefix && (!r.targetId || !r.targetId.startsWith(g.targetPrefix))){last={allowed:false,reason:'TARGET_OUT_OF_SCOPE'};continue;}
   if(at<timeValue(g.validFrom,'GRANT_TIME_INVALID')){last={allowed:false,reason:'NOT_YET_VALID'};continue;}
   if(g.validUntil && at>timeValue(g.validUntil,'GRANT_TIME_INVALID')){last={allowed:false,reason:'EXPIRED'};continue;}
   if(g.revokedAt && at>=timeValue(g.revokedAt,'GRANT_TIME_INVALID')){last={allowed:false,reason:'REVOKED'};continue;}
   if(g.maxQuantity!==undefined && r.quantity===undefined){last={allowed:false,reason:'LIMIT_CONTEXT_REQUIRED'};continue;}
   if(g.maxQuantity!==undefined && r.quantity!==undefined && r.quantity>g.maxQuantity){last={allowed:false,reason:'LIMIT_EXCEEDED'};continue;}
   if(!this.delegationChainActive(g,at)){last={allowed:false,reason:'DELEGATION_INVALID'};continue;}
   return {allowed:true,reason:'ALLOWED',grantId:g.id};
  }
  return last;
 }
}
