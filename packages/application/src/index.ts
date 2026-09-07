import type {CommandEnvelope,CommandHandler,CommandResult} from '../../contracts/src/index.js';
import type {AuthorityEvaluator,AuthorityReason} from '../../authority/src/index.js';

export interface IdempotencyStore {
 get(key:string):CommandResult|undefined|Promise<CommandResult|undefined>;
 putIfAbsent(key:string,result:CommandResult):CommandResult|Promise<CommandResult>;
}
export class InMemoryIdempotencyStore implements IdempotencyStore {
 private readonly results=new Map<string,CommandResult>();
 get(key:string){ return this.results.get(key); }
 putIfAbsent(key:string,result:CommandResult){ const prior=this.results.get(key); if(prior) return prior; this.results.set(key,Object.freeze({...result})); return result; }
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
}

export class CommandBus {
 private handlers=new Map<string,CommandHandler<any>>();
 private readonly idempotency:IdempotencyStore;
 private readonly versions:VersionStore|undefined;
 private readonly rejectionEvidence:RejectionEvidenceSink|undefined;
 constructor(private readonly authority:AuthorityEvaluator, options:CommandBusOptions={}){
  this.idempotency=options.idempotencyStore??new InMemoryIdempotencyStore();
  this.versions=options.versionStore;
  this.rejectionEvidence=options.rejectionEvidence;
 }
 register<T>(handler:CommandHandler<T>){ if(this.handlers.has(handler.action)) throw new Error('HANDLER_DUPLICATE'); this.handlers.set(handler.action,handler); }
 private async reject<T>(command:CommandEnvelope<T>,reason:string):Promise<CommandResult>{
  const result:CommandResult={status:'REJECTED',reason,eventIds:[],replayed:false};
  await this.rejectionEvidence?.append({commandId:command.commandId,idempotencyKey:command.idempotencyKey,actorId:command.actorId,action:command.action,...(command.targetId!==undefined?{targetId:command.targetId}:{}),reason,requestedAt:command.requestedAt,correlationId:command.correlationId,authorityGrantIds:[...command.authorityGrantIds],policyVersions:[...command.policyVersions]});
  const stored=await this.idempotency.putIfAbsent(command.idempotencyKey,result);
  return stored===result?result:{...stored,replayed:true};
 }
 async execute<T>(command:CommandEnvelope<T>, opts?:{quantity?:number}):Promise<CommandResult>{
  const prior=await this.idempotency.get(command.idempotencyKey); if(prior) return {...prior,replayed:true};
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
  const eventIds=await handler.handle(command);
  const result:CommandResult={status:'ACCEPTED',eventIds:[...eventIds],replayed:false};
  const stored=await this.idempotency.putIfAbsent(command.idempotencyKey,result);
  return stored===result?result:{...stored,replayed:true};
 }
}
