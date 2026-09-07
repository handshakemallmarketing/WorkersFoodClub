import type {CommandEnvelope,CommandHandler,CommandResult} from '../../contracts/src/index.js';
import type {AuthorityEvaluator,AuthorityReason} from '../../authority/src/index.js';

export class DomainRejection extends Error {
 constructor(readonly reason:string){ super(reason); this.name='DomainRejection'; }
}

export interface IdempotencyStore {
 get(key:string):CommandResult|undefined|Promise<CommandResult|undefined>;
 putIfAbsent(key:string,result:CommandResult):CommandResult|Promise<CommandResult>;
}
export class InMemoryIdempotencyStore implements IdempotencyStore {
 private readonly results=new Map<string,CommandResult>();
 get(key:string){ return this.results.get(key); }
 putIfAbsent(key:string,result:CommandResult){ const prior=this.results.get(key); if(prior) return prior; this.results.set(key,Object.freeze({...result,eventIds:[...result.eventIds]})); return result; }
}

export interface CommandExecutionProof { readonly commandId:string; readonly status:'ACCEPTED'|'REJECTED'|'DEFERRED'; readonly eventIds:readonly string[]; readonly reason?:string }
export interface CommandExecutionRegistry {
 record(commandId:string,result:CommandResult):void|Promise<void>;
 get(commandId:string):CommandExecutionProof|undefined|Promise<CommandExecutionProof|undefined>;
 isAccepted(commandId:string,eventId:string):boolean|Promise<boolean>;
}
export class InMemoryCommandExecutionRegistry implements CommandExecutionRegistry {
 private readonly entries=new Map<string,CommandExecutionProof>();
 record(commandId:string,result:CommandResult){
  const prior=this.entries.get(commandId);
  const next:CommandExecutionProof=Object.freeze({commandId,status:result.status,eventIds:[...result.eventIds],...(result.reason!==undefined?{reason:result.reason}:{})});
  if(prior){
   if(prior.status!==next.status||prior.reason!==next.reason||JSON.stringify(prior.eventIds)!==JSON.stringify(next.eventIds)) throw new Error('COMMAND_EXECUTION_PROOF_CONFLICT');
   return;
  }
  this.entries.set(commandId,next);
 }
 get(commandId:string){ return this.entries.get(commandId); }
 isAccepted(commandId:string,eventId:string){ const x=this.entries.get(commandId); return !!x&&x.status==='ACCEPTED'&&x.eventIds.includes(eventId); }
}

export interface VersionStore { get(targetId:string):number|undefined|Promise<number|undefined>; }
export class InMemoryVersionStore implements VersionStore {
 private readonly versions=new Map<string,number>();
 set(targetId:string,version:number){ if(!Number.isInteger(version)||version<0) throw new Error('VERSION_INVALID'); this.versions.set(targetId,version); }
 get(targetId:string){ return this.versions.get(targetId); }
}

export interface RejectedCommandEvidence {
 readonly commandId:string; readonly idempotencyKey:string; readonly actorId:string; readonly action:string;
 readonly targetId?:string; readonly reason:string; readonly requestedAt:string; readonly correlationId:string;
 readonly authorityGrantIds:readonly string[]; readonly policyVersions:readonly string[];
}
export interface RejectionEvidenceSink { append(record:RejectedCommandEvidence):void|Promise<void>; }
export class InMemoryRejectionEvidenceSink implements RejectionEvidenceSink {
 private readonly records:RejectedCommandEvidence[]=[];
 append(record:RejectedCommandEvidence){ this.records.push(Object.freeze({...record,authorityGrantIds:[...record.authorityGrantIds],policyVersions:[...record.policyVersions]})); }
 all(){ return [...this.records]; }
}

export interface CommandBusOptions {
 readonly idempotencyStore?:IdempotencyStore;
 readonly versionStore?:VersionStore;
 readonly rejectionEvidence?:RejectionEvidenceSink;
 readonly executionRegistry?:CommandExecutionRegistry;
}

export class CommandBus {
 private handlers=new Map<string,CommandHandler<any>>();
 private readonly idempotency:IdempotencyStore;
 private readonly versions:VersionStore|undefined;
 private readonly rejectionEvidence:RejectionEvidenceSink|undefined;
 private readonly executionRegistry:CommandExecutionRegistry|undefined;
 constructor(private readonly authority:AuthorityEvaluator, options:CommandBusOptions={}){
  this.idempotency=options.idempotencyStore??new InMemoryIdempotencyStore();
  this.versions=options.versionStore;
  this.rejectionEvidence=options.rejectionEvidence;
  this.executionRegistry=options.executionRegistry;
 }
 register<T>(handler:CommandHandler<T>){ if(this.handlers.has(handler.action)) throw new Error('HANDLER_DUPLICATE'); this.handlers.set(handler.action,handler); }
 private async reject<T>(command:CommandEnvelope<T>,reason:string):Promise<CommandResult>{
  const result:CommandResult={status:'REJECTED',reason,eventIds:[],replayed:false};
  await this.rejectionEvidence?.append({commandId:command.commandId,idempotencyKey:command.idempotencyKey,actorId:command.actorId,action:command.action,...(command.targetId!==undefined?{targetId:command.targetId}:{}),reason,requestedAt:command.requestedAt,correlationId:command.correlationId,authorityGrantIds:[...command.authorityGrantIds],policyVersions:[...command.policyVersions]});
  const stored=await this.idempotency.putIfAbsent(command.idempotencyKey,result);
  await this.executionRegistry?.record(command.commandId,stored);
  return stored===result?result:{...stored,replayed:true};
 }
 async execute<T>(command:CommandEnvelope<T>, opts?:{quantity?:number}):Promise<CommandResult>{
  const prior=await this.idempotency.get(command.idempotencyKey);
  if(prior){ await this.executionRegistry?.record(command.commandId,prior); return {...prior,replayed:true}; }
  if(command.expectedVersion!==undefined){
   if(!command.targetId) return this.reject(command,'EXPECTED_VERSION_REQUIRES_TARGET');
   if(!this.versions) return this.reject(command,'VERSION_STORE_REQUIRED');
   const current=await this.versions.get(command.targetId);
   if(current===undefined || current!==command.expectedVersion) return this.reject(command,'VERSION_CONFLICT');
  }
  const authRequest={actorId:command.actorId,action:command.action,at:command.requestedAt,grantIds:command.authorityGrantIds,...(command.targetId!==undefined?{targetId:command.targetId}:{}),...(opts?.quantity!==undefined?{quantity:opts.quantity}:{})};
  const decision=this.authority.evaluate(authRequest);
  if(!decision.allowed) return this.reject(command,decision.reason satisfies AuthorityReason);
  const handler=this.handlers.get(command.action); if(!handler) return this.reject(command,'NO_HANDLER');
  let eventIds:readonly string[];
  try { eventIds=await handler.handle(command); }
  catch(error){
   if(error instanceof DomainRejection) return this.reject(command,error.reason);
   throw error;
  }
  const result:CommandResult={status:'ACCEPTED',eventIds:[...eventIds],replayed:false};
  const stored=await this.idempotency.putIfAbsent(command.idempotencyKey,result);
  await this.executionRegistry?.record(command.commandId,stored);
  return stored===result?result:{...stored,replayed:true};
 }
}
