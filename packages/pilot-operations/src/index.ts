import type {AuthorityGrantId,ParticipantId} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';

export type AdminOperationOutcome='ACCEPTED'|'REJECTED'|'REPLAYED';
export type RecoveryDisposition='ALREADY_APPLIED'|'RETRIED';
export type PilotAuditDomain='MEMBER'|'OBLIGATION'|'PAYMENT'|'INVENTORY'|'FULFILLMENT'|'REMEDY'|'ECONOMICS';

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

export interface PilotAuditSnapshot{
 readonly domain:PilotAuditDomain;
 readonly targetId:string;
 readonly currentState:unknown;
 readonly sourceRecordIds:readonly string[];
 readonly observedAt:string;
}

export interface PilotAuditSource{
 readonly domain:PilotAuditDomain;
 read(targetId:string):PilotAuditSnapshot|undefined;
}

export interface AuditView{
 readonly targetId:string;
 readonly operationalRecords:readonly AdminAuditRecord[];
 readonly domainSnapshots:readonly PilotAuditSnapshot[];
 readonly sourceRecordIds:readonly string[];
 readonly generatedAt:string;
 readonly freshestSourceAt?:string;
 readonly ageMs?:number;
 readonly stale:boolean;
 readonly authoritative:false;
}

export interface OperationDiagnosis{
 readonly requestId:string;
 readonly targetId:string;
 readonly action:string;
 readonly outcome:'ACCEPTED'|'REJECTED';
 readonly failureReason?:string;
 readonly retryable:boolean;
 readonly attemptedAt:string;
 readonly ageMs:number;
 readonly stale:boolean;
 readonly auditId:string;
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
const recoveryAction='admin.recovery.reconcile';

export class GovernedPilotOperationsService{
 private readonly requests=new Map<string,StoredRequest<unknown>>();
 private readonly auditRecords:AdminAuditRecord[]=[];
 private auditSequence=0;
 constructor(private readonly authority:AuthorityEvaluator,private readonly auditSources:readonly PilotAuditSource[]=[]){
  const domains=auditSources.map(x=>x.domain);
  if(new Set(domains).size!==domains.length) throw new Error('AUDIT_SOURCE_DOMAIN_DUPLICATE');
 }

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

 private authorizeRead(ctx:AdminOperationContext,targetId:string){
  if(!validTime(ctx.at)) throw new Error('AUDIT_VIEW_TIME_INVALID');
  const decision=this.authority.evaluate({actorId:ctx.actorId,action:'admin.audit.read',targetId,at:ctx.at,grantIds:ctx.grantIds});
  if(!decision.allowed) throw new Error(`AUDIT_VIEW_UNAUTHORIZED:${decision.reason}`);
 }

 executeMutation<T,R>(ctx:AdminOperationContext,request:AdminOperationRequest<T>,mutate:(payload:T)=>AdminMutationEffect<R>):R{
  return this.#executeMutationInternal(ctx,request,mutate,false);
 }

 #executeMutationInternal<T,R>(ctx:AdminOperationContext,request:AdminOperationRequest<T>,mutate:(payload:T)=>AdminMutationEffect<R>,allowRecovery:boolean):R{
  this.validateRequest(request,ctx);
  const fp=requestFingerprint(ctx,request);
  const prior=this.requests.get(request.requestId) as StoredRequest<R>|undefined;
  if(request.action===recoveryAction&&!allowRecovery){
   const audit=this.appendAudit({requestId:request.requestId,actorId:ctx.actorId,action:request.action,targetId:request.targetId,reason:request.reason,attemptedAt:ctx.at,outcome:'REJECTED',authorityReason:'RECOVERY_ENTRYPOINT_REQUIRED',fingerprint:fp,sourceRecordIds:Object.freeze(prior?[prior.auditId]:[])});
   if(!prior)this.requests.set(request.requestId,Object.freeze({fingerprint:fp,outcome:'REJECTED',auditId:audit.id,targetId:request.targetId,action:request.action,attemptedAt:ctx.at,failureReason:'UNAUTHORIZED'}));
   throw new Error('ADMIN_RECOVERY_DIRECT_MUTATION_FORBIDDEN');
  }
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
   this.requests.set(request.requestId,Object.freeze({fingerprint:fp,outcome:'REJECTED',auditId:audit.id,targetId:request.targetId,action:request.action,attemptedAt:ctx.at,failureReason:'MUTATION_FAILED',...(request.action===recoveryAction?{}:{retry})}));
   throw error;
  }
 }

 recover(ctx:AdminOperationContext,input:{recoveryRequestId:string;originalRequestId:string;reason:string;maxAgeMs:number},probe:()=>RecoveryProbe):RecoveryResult{
  if(!input.recoveryRequestId.trim()||!input.originalRequestId.trim()) throw new Error('RECOVERY_REQUEST_ID_REQUIRED');
  if(!input.reason.trim()) throw new Error('RECOVERY_REASON_REQUIRED');
  if(!Number.isFinite(input.maxAgeMs)||input.maxAgeMs<0) throw new Error('RECOVERY_MAX_AGE_INVALID');
  const original=this.requests.get(input.originalRequestId);
  if(!original) throw new Error('RECOVERY_ORIGINAL_REQUEST_UNKNOWN');
  const request:AdminOperationRequest<{originalRequestId:string}>={requestId:input.recoveryRequestId,action:recoveryAction,targetId:original.targetId,reason:input.reason,payload:{originalRequestId:input.originalRequestId}};
  return this.#executeMutationInternal<{originalRequestId:string},RecoveryResult>(ctx,request,():AdminMutationEffect<RecoveryResult>=>{
   const age=Date.parse(ctx.at)-Date.parse(original.attemptedAt);
   if(age<0) throw new Error('RECOVERY_TIME_INVALID');
   if(age>input.maxAgeMs) throw new Error('RECOVERY_STALE');
   if(original.outcome==='ACCEPTED'){
    const sourceRecordIds=Object.freeze([original.auditId]);
    return {result:Object.freeze({disposition:'ALREADY_APPLIED',sourceRecordIds}),sourceRecordIds};
   }
   if(original.failureReason!=='MUTATION_FAILED'||!original.retry) throw new Error('RECOVERY_ORIGINAL_NOT_RETRYABLE');
   const observed=probe();
   if(!uniqueSources(observed.sourceRecordIds)) throw new Error('RECOVERY_SOURCE_LINEAGE_INVALID');
   if(observed.effectObserved){
    const sourceRecordIds=Object.freeze([original.auditId,...observed.sourceRecordIds]);
    return {result:Object.freeze({disposition:'ALREADY_APPLIED',sourceRecordIds}),sourceRecordIds};
   }
   const retried=original.retry();
   if(!uniqueSources(retried.sourceRecordIds)) throw new Error('RECOVERY_RETRY_LINEAGE_INVALID');
   const sourceRecordIds=Object.freeze([original.auditId,...observed.sourceRecordIds,...retried.sourceRecordIds]);
   if(!uniqueSources(sourceRecordIds)) throw new Error('RECOVERY_SOURCE_LINEAGE_INVALID');
   return {result:Object.freeze({disposition:'RETRIED',sourceRecordIds}),sourceRecordIds};
  },true);
 }

 diagnose(ctx:AdminOperationContext,requestId:string,maxAgeMs:number):OperationDiagnosis{
  if(!Number.isFinite(maxAgeMs)||maxAgeMs<0) throw new Error('DIAGNOSIS_MAX_AGE_INVALID');
  const request=this.requests.get(requestId);
  if(!request) throw new Error('DIAGNOSIS_REQUEST_UNKNOWN');
  this.authorizeRead(ctx,request.targetId);
  const ageMs=Date.parse(ctx.at)-Date.parse(request.attemptedAt);
  if(ageMs<0) throw new Error('DIAGNOSIS_TIME_BEFORE_REQUEST');
  return Object.freeze({requestId,targetId:request.targetId,action:request.action,outcome:request.outcome,...(request.failureReason?{failureReason:request.failureReason}:{}),retryable:request.outcome==='REJECTED'&&request.failureReason==='MUTATION_FAILED'&&Boolean(request.retry),attemptedAt:request.attemptedAt,ageMs,stale:ageMs>maxAgeMs,auditId:request.auditId,authoritative:false as const});
 }

 auditView(ctx:AdminOperationContext,targetId:string,maxAgeMs:number):AuditView{
  if(!Number.isFinite(maxAgeMs)||maxAgeMs<0) throw new Error('AUDIT_VIEW_MAX_AGE_INVALID');
  this.authorizeRead(ctx,targetId);
  const operationalRecords=this.auditRecords.filter(x=>x.targetId===targetId);
  const domainSnapshots=this.auditSources.flatMap(source=>{
   const snapshot=source.read(targetId);
   if(!snapshot) return [];
   if(snapshot.domain!==source.domain||snapshot.targetId!==targetId) throw new Error('AUDIT_SOURCE_SEMANTIC_MISMATCH');
   if(!validTime(snapshot.observedAt)||Date.parse(snapshot.observedAt)>Date.parse(ctx.at)) throw new Error('AUDIT_SOURCE_TIME_INVALID');
   if(!uniqueSources(snapshot.sourceRecordIds)) throw new Error('AUDIT_SOURCE_LINEAGE_INVALID');
   return [Object.freeze({...snapshot,sourceRecordIds:Object.freeze([...snapshot.sourceRecordIds])})];
  });
  const allSourceRecordIds=[...operationalRecords.map(x=>x.id),...domainSnapshots.flatMap(x=>x.sourceRecordIds)];
  if(!uniqueSources(allSourceRecordIds)&&allSourceRecordIds.length>0) throw new Error('AUDIT_VIEW_SOURCE_COLLISION');
  const sourceTimes=[...operationalRecords.map(x=>x.attemptedAt),...domainSnapshots.map(x=>x.observedAt)];
  const freshest=sourceTimes.reduce<string|undefined>((latest,current)=>!latest||Date.parse(current)>Date.parse(latest)?current:latest,undefined);
  const ageMs=freshest===undefined?undefined:Date.parse(ctx.at)-Date.parse(freshest);
  if(ageMs!==undefined&&ageMs<0) throw new Error('AUDIT_VIEW_TIME_BEFORE_SOURCE');
  return Object.freeze({targetId,operationalRecords:Object.freeze([...operationalRecords]),domainSnapshots:Object.freeze(domainSnapshots),sourceRecordIds:Object.freeze(allSourceRecordIds),generatedAt:ctx.at,...(freshest!==undefined&&ageMs!==undefined?{freshestSourceAt:freshest,ageMs}:{}),stale:ageMs===undefined||ageMs>maxAgeMs,authoritative:false as const});
 }

 auditLog(){return Object.freeze([...this.auditRecords]);}
}
