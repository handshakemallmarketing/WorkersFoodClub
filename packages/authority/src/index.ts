import type {AuthorityGrantId,ParticipantId} from '../../kernel/src/index.js';
export interface AuthorityGrant { readonly id:AuthorityGrantId; readonly grantorId:ParticipantId; readonly actorId:ParticipantId; readonly actions:readonly string[]; readonly targetPrefix?:string; readonly validFrom:string; readonly validUntil?:string; readonly revokedAt?:string; readonly maxQuantity?:number }
export interface AuthorityDecision { readonly allowed:boolean; readonly reason:'ALLOWED'|'NO_GRANT'|'ACTOR_MISMATCH'|'ACTION_OUT_OF_SCOPE'|'TARGET_OUT_OF_SCOPE'|'NOT_YET_VALID'|'EXPIRED'|'REVOKED'|'LIMIT_EXCEEDED' }
export interface AuthorityRequest { actorId:ParticipantId; action:string; targetId?:string; at:string; quantity?:number; grantIds:readonly AuthorityGrantId[] }
export class InMemoryAuthorityStore {
 private grants=new Map<AuthorityGrantId,AuthorityGrant>();
 put(g:AuthorityGrant){ this.grants.set(g.id,Object.freeze({...g})); }
 revoke(id:AuthorityGrantId,at:string){ const g=this.grants.get(id); if(!g) throw new Error('GRANT_NOT_FOUND'); this.grants.set(id,Object.freeze({...g,revokedAt:at})); }
 get(id:AuthorityGrantId){ return this.grants.get(id); }
}
export class AuthorityEvaluator {
 constructor(private readonly store:InMemoryAuthorityStore){}
 evaluate(r:AuthorityRequest):AuthorityDecision{
  if(r.grantIds.length===0) return {allowed:false,reason:'NO_GRANT'};
  let last:AuthorityDecision={allowed:false,reason:'NO_GRANT'};
  for(const id of r.grantIds){
   const g=this.store.get(id); if(!g){last={allowed:false,reason:'NO_GRANT'};continue;}
   if(g.actorId!==r.actorId){last={allowed:false,reason:'ACTOR_MISMATCH'};continue;}
   if(!g.actions.includes(r.action)){last={allowed:false,reason:'ACTION_OUT_OF_SCOPE'};continue;}
   if(g.targetPrefix && (!r.targetId || !r.targetId.startsWith(g.targetPrefix))){last={allowed:false,reason:'TARGET_OUT_OF_SCOPE'};continue;}
   if(Date.parse(r.at)<Date.parse(g.validFrom)){last={allowed:false,reason:'NOT_YET_VALID'};continue;}
   if(g.validUntil && Date.parse(r.at)>Date.parse(g.validUntil)){last={allowed:false,reason:'EXPIRED'};continue;}
   if(g.revokedAt && Date.parse(r.at)>=Date.parse(g.revokedAt)){last={allowed:false,reason:'REVOKED'};continue;}
   if(g.maxQuantity!==undefined && r.quantity!==undefined && r.quantity>g.maxQuantity){last={allowed:false,reason:'LIMIT_EXCEEDED'};continue;}
   return {allowed:true,reason:'ALLOWED'};
  }
  return last;
 }
}
