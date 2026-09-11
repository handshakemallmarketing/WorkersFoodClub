import type {AuthorityGrantId,EvidenceId,ParticipantId,Quantity} from '../../kernel/src/index.js';
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

export interface QuantityTransferEvent extends TransferEvent {
  readonly quantity?:Quantity;
}

export interface AcceptanceTransferSource {
  readonly id:string;
  readonly obligationId:string;
  readonly state:'ACCEPTED'|'REJECTED'|'PARTIALLY_ACCEPTED';
  readonly quantity:Quantity;
  readonly acceptedAt:string;
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

export interface QuantityTransferEvaluation extends TransferEvaluation {
  readonly totalQuantity:Quantity;
  readonly titleTransferredQuantity:Quantity;
  readonly riskTransferredQuantity:Quantity;
  readonly titleComplete:boolean;
  readonly riskComplete:boolean;
  readonly titleEventIds:readonly string[];
  readonly riskEventIds:readonly string[];
}

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const at=(v:string)=>new Date(v).getTime();

export function transferEventFromAcceptance(input:AcceptanceTransferSource):QuantityTransferEvent|undefined{
  if(!input.id.trim()||!input.obligationId.trim()||!validTime(input.acceptedAt)||input.evidenceIds.length===0) throw new Error('TRANSFER_ACCEPTANCE_SOURCE_INVALID');
  if(!Number.isFinite(input.quantity.amount)||input.quantity.amount<0||!input.quantity.unit.trim()) throw new Error('TRANSFER_ACCEPTANCE_QUANTITY_INVALID');
  if(input.state==='REJECTED'){
    if(input.quantity.amount!==0) throw new Error('TRANSFER_REJECTED_ACCEPTANCE_QUANTITY_INVALID');
    return undefined;
  }
  if(input.quantity.amount<=0) throw new Error('TRANSFER_ACCEPTANCE_QUANTITY_INVALID');
  return Object.freeze({
    id:input.id,
    transactionId:input.obligationId,
    type:'ACCEPTANCE',
    occurredAt:input.acceptedAt,
    evidenceIds:Object.freeze([...input.evidenceIds]),
    quantity:Object.freeze({...input.quantity})
  });
}

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

  private eligible(input:{transactionId:string;transactionType:string;policyId:string;policyVersion:number;events:readonly TransferEvent[]}){
    const policy=this.registry.get(input.policyId,input.policyVersion);
    if(policy.transactionType!==input.transactionType) throw new Error('TRANSFER_POLICY_TRANSACTION_TYPE_MISMATCH');
    const events=input.events.filter(e=>e.transactionId===input.transactionId);
    const ids=new Set<string>();
    for(const e of events){
      if(!e.id.trim()||!e.type.trim()||!validTime(e.occurredAt)||e.evidenceIds.length===0) throw new Error('TRANSFER_EVENT_EVIDENCE_REQUIRED');
      if(ids.has(e.id)) throw new Error('TRANSFER_EVENT_ID_DUPLICATE');
      ids.add(e.id);
    }
    return {policy,events:events.filter(e=>at(e.occurredAt)>=at(policy.effectiveFrom))};
  }

  evaluate(input:{transactionId:string;transactionType:string;policyId:string;policyVersion:number;events:readonly TransferEvent[]}):TransferEvaluation{
    const {policy,events}=this.eligible(input);
    const first=(rule:TransferRule)=>events.filter(e=>e.type===triggerType(rule)).sort((a,b)=>at(a.occurredAt)-at(b.occurredAt))[0];
    const titleEvent=first(policy.title);const riskEvent=first(policy.risk);
    const base={transactionId:input.transactionId,policyId:policy.id,policyVersion:policy.version,titleTransferred:Boolean(titleEvent),riskTransferred:Boolean(riskEvent)};
    return Object.freeze({...base,...(titleEvent?{titleEventId:titleEvent.id}:{}),...(riskEvent?{riskEventId:riskEvent.id}:{})});
  }

  evaluateQuantities(input:{transactionId:string;transactionType:string;policyId:string;policyVersion:number;totalQuantity:Quantity;events:readonly QuantityTransferEvent[]}):QuantityTransferEvaluation{
    if(!Number.isFinite(input.totalQuantity.amount)||input.totalQuantity.amount<=0) throw new Error('TRANSFER_TOTAL_QUANTITY_INVALID');
    const {policy,events}=this.eligible(input);
    const accumulate=(rule:TransferRule)=>{
      const matching=events.filter(e=>e.type===triggerType(rule)).sort((a,b)=>at(a.occurredAt)-at(b.occurredAt)) as QuantityTransferEvent[];
      let amount=0;const eventIds:string[]=[];
      for(const e of matching){
        if(!e.quantity||!Number.isFinite(e.quantity.amount)||e.quantity.amount<=0) throw new Error('TRANSFER_TRIGGER_QUANTITY_REQUIRED');
        if(e.quantity.unit!==input.totalQuantity.unit) throw new Error('TRANSFER_QUANTITY_UNIT_MISMATCH');
        amount+=e.quantity.amount;
        if(amount>input.totalQuantity.amount) throw new Error('TRANSFER_QUANTITY_EXCEEDS_TOTAL');
        eventIds.push(e.id);
      }
      return {quantity:Object.freeze({amount,unit:input.totalQuantity.unit}),eventIds:Object.freeze(eventIds)};
    };
    const title=accumulate(policy.title);const risk=accumulate(policy.risk);
    const titleTransferred=title.quantity.amount>0;const riskTransferred=risk.quantity.amount>0;
    const result={
      transactionId:input.transactionId,policyId:policy.id,policyVersion:policy.version,
      titleTransferred,riskTransferred,
      ...(titleTransferred?{titleEventId:title.eventIds[0]}:{}),...(riskTransferred?{riskEventId:risk.eventIds[0]}:{}),
      totalQuantity:Object.freeze({...input.totalQuantity}),titleTransferredQuantity:title.quantity,riskTransferredQuantity:risk.quantity,
      titleComplete:title.quantity.amount===input.totalQuantity.amount,riskComplete:risk.quantity.amount===input.totalQuantity.amount,
      titleEventIds:title.eventIds,riskEventIds:risk.eventIds
    };
    return Object.freeze(result);
  }
}
