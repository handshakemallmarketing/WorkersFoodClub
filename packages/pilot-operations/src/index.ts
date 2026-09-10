import type {AuthorityGrantId,ParticipantId} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';

export type AdminOperationOutcome='ACCEPTED'|'REJECTED'|'REPLAYED';
export type RecoveryDisposition='ALREADY_APPLIED'|'RETRIED';

export interface AdminOperationContext {
 readonly actorId:ParticipantId;
 readonly grantIds:readonly AuthorityGrantId[];
 readonly at:string;
}

export interface AdminOperationRequest<T=unknown>{
 readonly requestId:string;
 readonly action:string;
 readonly targetId:string;
 readonly reason:string;
 readonly payload:T;
}

export interface AdminMutationEffect<R>{
 readonly result:R;
 readonly sourceRecordIds:readonly string[];
}

export interface AdminAuditRecord{
 readonly id:string;
 readonly requestId:string;
 readonly actorId:ParticipantId;
 readonly action:string;
 readonly targetId:string;
 readonly reason:string;
 readonly attemptedAt:string;
 readonly outcome:AdminOperationOutcome;
 readonly authorityReason:string;
 readonly grantId?:AuthorityGrantId;
 readonly fingerprint:string;
 readonly sourceRecordIds:readonly string[];
}

export interface RecoveryProbe{
 readonly effectObserved:boolean;
 readonly sourceRecordIds:readonly string[];
}

export interface RecoveryResult{
 readonly disposition:RecoveryDisposition;
 readonly sourceRecordIds:readonly string[];
}

export interface AuditView{
 readonly targetId:string;
 readonly records:readonly AdminAuditRecord[];
 readonly sourceRecordIds:readonly string[];
 readonly generatedAt:string;
 readonly freshestSourceAt?:string;
 readonly ageMs?:number;
 readonly stale:boolean;
 readonly authoritative:false;
}

type StoredRequest<R>={
 readonly fingerprint:string;
 readonly outcome:'ACCEPTED'|'REJECTED';
 readonly result?:R;
 readonly auditId:string;
 readonly targetId:string;
 readonly action:string;
 readonly attemptedAt:string;
 readonly failureReason?:string;
 readonly retry?:()=>AdminMutationEffect<R>;
};

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const stable=(value:unknown):string=>{
 if(value===null||typeof value!=='object'){
  const encoded=JSON.stringify(value);
  return encoded===undefined?'undefined':encoded;
 }
 if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
 const record=value as Record<string,unknown>;
 return `{${Object.keys(record).sort().map(k=>`${JSON.stringify(k)}:${stable(record[k])}`).join(',')}}`;
};
const requestFingerprint=(ctx:AdminOperationContext,request:AdminOperationRequest)=>stable({actorId:String(ctx.actorId),action:request.action,targetId:request.targetId,reason:request.reason,payload:request.payload});
const uniqueSources=(ids:readonly string[])=>ids.length===new Set(ids).size&&ids.every(x=>x.trim().length>0);

export class GovernedPilotOperationsService{
 private readonly requests=new Map<string,StoredRequest<unknown>>();
 private readonly auditRecords:AdminAuditRecord[]=[];
 private auditSequence=0;
 constructor(private readonly authority:AuthorityEvaluator){}

 private appendAudit(input:Omit<AdminAuditRecord,'id'>){
  const record=Object.freeze({...input,id:`audit:${input.requestId}:${++this.auditSequence}`}) as AdminAuditRecord;
  this.auditRecords.push(record);
  return record;
 }

 private validateRequest(request:AdminOperationRequest,ctx:AdminOperationContext){
  if(!request.requestId.trim()) throw new Error('ADMIN_REQUEST_ID_REQUIRED');
  if(!request.action.trim()) throw new Error('ADMIN_ACTION_REQUIRED');
  if(!request.targetId.trim()) throw new Error('ADMIN_TARGET_REQUIRED');
  if(!request.reason.trim()) throw new Error('ADMIN_REASON_REQUIRED');
  if(!validTime(ctx.at)) throw new Error('ADMIN_TIME_INVALID');
 }

 executeMutation<T,R>(ctx:AdminOperationContext,request:AdminOperationRequest<T>,mutate:(payload:T)=>AdminMutationEffect<R>):R{
  this.validateRequest(request,ctx);
  const fp=requestFingerprint(ctx,request);
  const prior=this.requests.get(request.requestId) as StoredRequest<R>|undefined;
  if(prior){
   if(prior.fingerprint!==fp){
    this.appendAudit({requestId:request.requestId,actorId:ctx.actorId,action:request.action,targetId:request.targetId,reason:request.reason,attemptedAt:ctx.at,outcome:'REJECTED',authorityReason:'REQUEST_ID_CONFLICT',fingerprint:fp,sourceRecordIds:Object.freeze([prior.auditId])});
    throw new Error('ADMIN_REQUEST_ID_CONFLICT');
   }
   const replay=this.appendAudit({requestId:request.requestId,actorId:ctx.actorId,action:request.action,targetId:request.targetId,reason:request.reason,attemptedAt:ctx.at,outcome:'REPLAYED',authorityReason:prior.outcome==='ACCEPTED'?'PREVIOUSLY_ACCEPTED':'PREVIOUSLY_REJECTED',fingerprint:fp,sourceRecordIds:Object.freeze([prior.auditId])});
   if(prior.outcome==='REJECTED') throw new Error(`ADMIN_REQUEST_REJECTED:${replay.authorityReason}`);
   return prior.result as R;
  }

  const decision=this.authority.evaluate({actorId:ctx.actorId,action:request.action,targetId:request.targetId,at:ctx.at,grantIds:ctx.grantIds});
  if(!decision.allowed){
   const audit=this.appendAudit({requestId:request.requestId,actorId:ctx.actorId,action:request.action,targetId:request.targetId,reason:request.reason,attemptedAt:ctx.at,outcome:'REJECTED',authorityReason:decision.reason,fingerprint:fp,sourceRecordIds:Object.freeze([])});
   this.requests.set(request.requestId,Object.freeze({fingerprint:fp,outcome:'REJECTED',auditId:audit.id,targetId:request.targetId,action:request.action,attemptedAt:ctx.at,failureReason:'UNAUTHORIZED'}));
   throw new Error(`ADMIN_UNAUTHORIZED:${decision.reason}`);
  }

  const retry=()=>mutate(request.payload);
  try{
   const effect=retry();
   if(!uniqueSources(effect.sourceRecordIds)) throw new Error('ADMIN_SOURCE_LINEAGE_INVALID');
   const audit=this.appendAudit({requestId:request.requestId,actorId:ctx.actorId,action:request.action,targetId:request.targetId,reason:request.reason,attemptedAt:ctx.at,outcome:'ACCEPTED',authorityReason:decision.reason,...(decision.grantId?{grantId:decision.grantId}:{}),fingerprint:fp,sourceRecordIds:Object.freeze([...effect.sourceRecordIds])});
   this.requests.set(request.requestId,Object.freeze({fingerprint:fp,outcome:'ACCEPTED',result:effect.result,auditId:audit.id,targetId:request.targetId,action:request.action,attemptedAt:ctx.at}));
   return effect.result;
  }catch(error){
   const audit=this.appendAudit({requestId:request.requestId,actorId:ctx.actorId,action:request.action,targetId:request.targetId,reason:request.reason,attemptedAt:ctx.at,outcome:'REJECTED',authorityReason:'MUTATION_FAILED',...(decision.grantId?{grantId:decision.grantId}:{}),fingerprint:fp,sourceRecordIds:Object.freeze([])});
   this.requests.set(request.requestId,Object.freeze({fingerprint:fp,outcome:'REJECTED',auditId:audit.id,targetId:request.targetId,action:request.action,attemptedAt:ctx.at,failureReason:'MUTATION_FAILED',...(request.action==='admin.recovery.reconcile'?{}:{retry})}));
   throw error;
  }
 }

 recover(ctx:AdminOperationContext,input:{recoveryRequestId:string;originalRequestId:string;reason:string;maxAgeMs:number},probe:()=>RecoveryProbe):RecoveryResult{
  if(!input.recoveryRequestId.trim()||!input.originalRequestId.trim()) throw new Error('RECOVERY_REQUEST_ID_REQUIRED');
  if(!input.reason.trim()) throw new Error('RECOVERY_REASON_REQUIRED');
  if(!Number.isFinite(input.maxAgeMs)||input.maxAgeMs<0) throw new Error('RECOVERY_MAX_AGE_INVALID');
  const original=this.requests.get(input.originalRequestId);
  if(!original) throw new Error('RECOVERY_ORIGINAL_REQUEST_UNKNOWN');
  const request:AdminOperationRequest={requestId:input.recoveryRequestId,action:'admin.recovery.reconcile',targetId:original.targetId,reason:input.reason,payload:{originalRequestId:input.originalRequestId}};
  return this.executeMutation(ctx,request,()=>{
   const age=Date.parse(ctx.at)-Date.parse(original.attemptedAt);
   if(age<0) throw new Error('RECOVERY_TIME_INVALID');
   if(age>input.maxAgeMs) throw new Error('RECOVERY_STALE');
   if(original.outcome==='ACCEPTED') return {result:Object.freeze({disposition:'ALREADY_APPLIED' as const,sourceRecordIds:Object.freeze([original.auditId])}),sourceRecordIds:Object.freeze([original.auditId])};
   if(original.failureReason!=='MUTATION_FAILED'||!original.retry) throw new Error('RECOVERY_ORIGINAL_NOT_RETRYABLE');
   const observed=probe();
   if(!uniqueSources(observed.sourceRecordIds)) throw new Error('RECOVERY_SOURCE_LINEAGE_INVALID');
   if(observed.effectObserved){
    const sourceRecordIds=Object.freeze([original.auditId,...observed.sourceRecordIds]);
    return {result:Object.freeze({disposition:'ALREADY_APPLIED' as const,sourceRecordIds}),sourceRecordIds};
   }
   const retried=original.retry();
   if(!uniqueSources(retried.sourceRecordIds)) throw new Error('RECOVERY_RETRY_LINEAGE_INVALID');
   const sourceRecordIds=Object.freeze([original.auditId,...observed.sourceRecordIds,...retried.sourceRecordIds]);
   if(!uniqueSources(sourceRecordIds)) throw new Error('RECOVERY_SOURCE_LINEAGE_INVALID');
   return {result:Object.freeze({disposition:'RETRIED' as const,sourceRecordIds}),sourceRecordIds};
  });
 }

 auditView(ctx:AdminOperationContext,targetId:string,maxAgeMs:number):AuditView{
  if(!Number.isFinite(maxAgeMs)||maxAgeMs<0) throw new Error('AUDIT_VIEW_MAX_AGE_INVALID');
  if(!validTime(ctx.at)) throw new Error('AUDIT_VIEW_TIME_INVALID');
  const decision=this.authority.evaluate({actorId:ctx.actorId,action:'admin.audit.read',targetId,at:ctx.at,grantIds:ctx.grantIds});
  if(!decision.allowed) throw new Error(`AUDIT_VIEW_UNAUTHORIZED:${decision.reason}`);
  const records=this.auditRecords.filter(x=>x.targetId===targetId);
  const freshest=records.reduce<string|undefined>((latest,r)=>!latest||Date.parse(r.attemptedAt)>Date.parse(latest)?r.attemptedAt:latest,undefined);
  const ageMs=freshest===undefined?undefined:Date.parse(ctx.at)-Date.parse(freshest);
  if(ageMs!==undefined&&ageMs<0) throw new Error('AUDIT_VIEW_TIME_BEFORE_SOURCE');
  return Object.freeze({targetId,records:Object.freeze([...records]),sourceRecordIds:Object.freeze(records.map(x=>x.id)),generatedAt:ctx.at,...(freshest?{freshestSourceAt:freshest,ageMs}:{}),stale:ageMs===undefined||ageMs>maxAgeMs,authoritative:false as const});
 }

 auditLog(){return Object.freeze([...this.auditRecords]);}
}
