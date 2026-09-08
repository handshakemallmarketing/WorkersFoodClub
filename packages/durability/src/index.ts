import type {CommandResult} from '../../contracts/src/index.js';

/**
 * Durable ownership/idempotency lifecycle boundary.
 * claim() and commit() are separate lifecycle operations; a database adapter must
 * make each transition serializable and durable. Atomic domain/event/result
 * co-commit is a stronger boundary provided separately by PostgresDomainCommitter.
 */
export interface DurableCommandStore {
 claim(idempotencyKey:string,commandId:string):Promise<'CLAIMED'|'IN_FLIGHT'|CommandResult>;
 commit(idempotencyKey:string,commandId:string,result:CommandResult):Promise<CommandResult>;
 abandon(idempotencyKey:string,commandId:string):Promise<void>;
}

type Entry={commandId:string;state:'IN_FLIGHT'|'COMMITTED';result?:CommandResult};

/** Deterministic reference adapter used by adversarial tests; not a database durability claim. */
export class InMemoryAtomicCommandStore implements DurableCommandStore {
 private readonly entries=new Map<string,Entry>();
 async claim(key:string,commandId:string){
  const prior=this.entries.get(key);
  if(prior){
   if(prior.commandId!==commandId) throw new Error('IDEMPOTENCY_KEY_COMMAND_CONFLICT');
   if(prior.state==='COMMITTED'&&prior.result) return Object.freeze({...prior.result,eventIds:[...prior.result.eventIds],replayed:true});
   return 'IN_FLIGHT' as const;
  }
  this.entries.set(key,{commandId,state:'IN_FLIGHT'}); return 'CLAIMED' as const;
 }
 async commit(key:string,commandId:string,result:CommandResult){
  const entry=this.entries.get(key); if(!entry||entry.commandId!==commandId) throw new Error('DURABLE_CLAIM_REQUIRED');
  if(entry.state==='COMMITTED'&&entry.result) return entry.result;
  const frozen=Object.freeze({...result,eventIds:[...result.eventIds]}); entry.state='COMMITTED';entry.result=frozen;return frozen;
 }
 async abandon(key:string,commandId:string){const e=this.entries.get(key);if(e?.commandId===commandId&&e.state==='IN_FLIGHT')this.entries.delete(key);}
}
