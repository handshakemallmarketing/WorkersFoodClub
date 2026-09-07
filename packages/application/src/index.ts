import type {CommandEnvelope,CommandHandler,CommandResult} from '../../contracts/src/index.js';
import type {AuthorityEvaluator} from '../../authority/src/index.js';
export class CommandBus {
 private handlers=new Map<string,CommandHandler<any>>(); private results=new Map<string,CommandResult>();
 constructor(private readonly authority:AuthorityEvaluator){}
 register<T>(handler:CommandHandler<T>){ if(this.handlers.has(handler.action)) throw new Error('HANDLER_DUPLICATE'); this.handlers.set(handler.action,handler); }
 async execute<T>(command:CommandEnvelope<T>, opts?:{quantity?:number}):Promise<CommandResult>{
  const prior=this.results.get(command.idempotencyKey); if(prior) return {...prior,replayed:true};
  const authRequest = {actorId:command.actorId,action:command.action,at:command.requestedAt,grantIds:command.authorityGrantIds, ...(command.targetId!==undefined?{targetId:command.targetId}:{}), ...(opts?.quantity!==undefined?{quantity:opts.quantity}:{})};
  const decision=this.authority.evaluate(authRequest);
  if(!decision.allowed){ const result:CommandResult={status:'REJECTED',reason:decision.reason,eventIds:[],replayed:false}; this.results.set(command.idempotencyKey,result); return result; }
  const handler=this.handlers.get(command.action); if(!handler){ const result:CommandResult={status:'REJECTED',reason:'NO_HANDLER',eventIds:[],replayed:false}; this.results.set(command.idempotencyKey,result); return result; }
  const eventIds=await handler.handle(command); const result:CommandResult={status:'ACCEPTED',eventIds:[...eventIds],replayed:false}; this.results.set(command.idempotencyKey,result); return result;
 }
}
