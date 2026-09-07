import type {AuthorityGrantId,CommandId,EvidenceId,ParticipantId} from '../../kernel/src/index.js';
export interface CommandEnvelope<T=unknown> {
 readonly commandId:CommandId; readonly idempotencyKey:string; readonly actorId:ParticipantId;
 readonly action:string; readonly targetId?:string; readonly expectedVersion?:number;
 readonly authorityGrantIds:readonly AuthorityGrantId[]; readonly evidenceIds:readonly EvidenceId[];
 readonly policyVersions:readonly string[]; readonly requestedAt:string; readonly effectiveAt?:string;
 readonly correlationId:string; readonly causationId?:string; readonly payload:T;
}
export type CommandStatus='ACCEPTED'|'REJECTED'|'DEFERRED';
export interface CommandResult { readonly status:CommandStatus; readonly reason?:string; readonly eventIds:readonly string[]; readonly replayed:boolean }
export interface CommandHandler<T=unknown>{ readonly action:string; handle(command:CommandEnvelope<T>):Promise<readonly string[]>|readonly string[] }
