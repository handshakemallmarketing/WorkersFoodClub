import type {AuthorityGrantId,EvidenceId,ParticipantId} from '../../kernel/src/index.js';
import type {AuthorityEvaluator} from '../../authority/src/index.js';

export type TransferDimension='TITLE'|'RISK';
export type TransferTrigger='HANDOVER'|'ACCEPTANCE'|'SETTLEMENT'|'REMEDY_COMPLETION'|'NAMED_EVENT';

export interface TransferEvent {
  readonly id:string;
  readonly transactionId:string;
  readonly type:string;
  readonly occurredAt:string;
  readonly evidenceIds:readonly EvidenceId[];
}

export interface TransferRule {
  readonly dimension:TransferDimension;
  readonly trigger:TransferTrigger;
  /** Required only when trigger=NAMED_EVENT. */
  readonly eventType?:string;
}

export interface TransactionTransferPolicy {
  readonly id:string;
  readonly version:number;
  readonly transactionType:string;
  readonly title:TransferRule;
  readonly risk:TransferRule;
  readonly effectiveFrom:string;
  readonly authorizedBy:ParticipantId;
  readonly authorityGrantId:string;
  readonly evidenceIds:readonly EvidenceId[];
  readonly status:'RATIFIED';
}

/** @deprecated Caller-shaped authorization is not an authority source and is ignored by ratification. */
export interface TransferPolicyAuthorization {
  readonly participantId:ParticipantId;
  readonly authorityGrantId:string;
  readonly scope:'TRANSFER_POLICY_GOVERNANCE';
  readonly validFrom:string;
  readonly validUntil?:string;
  readonly revokedAt?:string;
}

export interface TransferEvaluation {
  readonly transactionId:string;
  readonly policyId:string;
  readonly policyVersion:number;
  readonly titleTransferred:boolean;
  readonly titleEventId?:string;
  readonly riskTransferred:boolean;
  readonly riskEventId?:string;
}

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const at=(v:string)=>new Date(v).getTime();

function validateRule(rule:TransferRule):void{
  if(rule.trigger==='NAMED_EVENT'){
    if(!rule.eventType?.trim()) throw new Error('TRANSFER_NAMED_EVENT_TYPE_REQUIRED');
  }else if(rule.eventType!==undefined){
    throw new Error('TRANSFER_EVENT_TYPE_ONLY_FOR_NAMED_EVENT');
  }
}

function triggerType(rule:TransferRule):string{
  switch(rule.trigger){
    case 'HANDOVER': return 'HANDOVER';
    case 'ACCEPTANCE': return 'ACCEPTANCE';
    case 'SETTLEMENT': return 'SETTLEMENT';
    case 'REMEDY_COMPLETION': return 'REMEDY_COMPLETION';
    case 'NAMED_EVENT': return rule.eventType!;
  }
}

export class GovernedTransferPolicyRegistry {
  private readonly versions=new Map<string,Map<number,TransactionTransferPolicy>>();
  constructor(private readonly authority:Pick<AuthorityEvaluator,'evaluate'>,private readonly clock:()=>string=()=>new Date().toISOString()){}

  ratify(policy:TransactionTransferPolicy,_untrustedAuthorization?:TransferPolicyAuthorization):TransactionTransferPolicy{
    if(!policy.id.trim()||policy.version<1||!Number.isInteger(policy.version)||!policy.transactionType.trim()) throw new Error('TRANSFER_POLICY_IDENTITY_INVALID');
    if(policy.status!=='RATIFIED') throw new Error('TRANSFER_POLICY_NOT_RATIFIED');
    if(!validTime(policy.effectiveFrom)||policy.evidenceIds.length===0) throw new Error('TRANSFER_POLICY_EVIDENCE_REQUIRED');
    validateRule(policy.title);validateRule(policy.risk);
    const ratificationAt=this.clock();if(!validTime(ratificationAt)) throw new Error('TRANSFER_RATIFICATION_TIME_INVALID');
    const decision=this.authority.evaluate({actorId:policy.authorizedBy,action:'RatifyTransferPolicy',targetId:policy.id,at:ratificationAt,grantIds:[policy.authorityGrantId as AuthorityGrantId]});
    if(!decision.allowed||decision.grantId!==policy.authorityGrantId) throw new Error('TRANSFER_POLICY_UNAUTHORIZED');
    const byVersion=this.versions.get(policy.id)??new Map<number,TransactionTransferPolicy>();
    if(byVersion.has(policy.version)) throw new Error('TRANSFER_POLICY_VERSION_DUPLICATE');
    const prior=[...byVersion.keys()].sort((a,b)=>a-b).at(-1);
    if(prior!==undefined&&policy.version!==prior+1) throw new Error('TRANSFER_POLICY_VERSION_SEQUENCE_INVALID');
    const frozen=Object.freeze({...policy,title:Object.freeze({...policy.title}),risk:Object.freeze({...policy.risk}),evidenceIds:Object.freeze([...policy.evidenceIds])});
    byVersion.set(policy.version,frozen);this.versions.set(policy.id,byVersion);return frozen;
  }

  get(policyId:string,version:number):TransactionTransferPolicy{
    const policy=this.versions.get(policyId)?.get(version);
    if(!policy) throw new Error('TRANSFER_POLICY_REQUIRED');
    return policy;
  }
}

export class GovernedTransferEvaluator {
  constructor(private readonly registry:GovernedTransferPolicyRegistry){}

  evaluate(input:{transactionId:string;transactionType:string;policyId:string;policyVersion:number;events:readonly TransferEvent[]}):TransferEvaluation{
    const policy=this.registry.get(input.policyId,input.policyVersion);
    if(policy.transactionType!==input.transactionType) throw new Error('TRANSFER_POLICY_TRANSACTION_TYPE_MISMATCH');
    const events=input.events.filter(e=>e.transactionId===input.transactionId);
    for(const e of events){if(!e.id.trim()||!e.type.trim()||!validTime(e.occurredAt)||e.evidenceIds.length===0) throw new Error('TRANSFER_EVENT_EVIDENCE_REQUIRED');}
    const eligible=events.filter(e=>at(e.occurredAt)>=at(policy.effectiveFrom));
    const first=(rule:TransferRule)=>eligible.filter(e=>e.type===triggerType(rule)).sort((a,b)=>at(a.occurredAt)-at(b.occurredAt))[0];
    const titleEvent=first(policy.title);const riskEvent=first(policy.risk);
    const base={transactionId:input.transactionId,policyId:policy.id,policyVersion:policy.version,titleTransferred:Boolean(titleEvent),riskTransferred:Boolean(riskEvent)};
    return Object.freeze({
      ...base,
      ...(titleEvent?{titleEventId:titleEvent.id}:{}),
      ...(riskEvent?{riskEventId:riskEvent.id}:{})
    });
  }
}
