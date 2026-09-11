import type {ParticipantId,EvidenceId} from '../../kernel/src/index.js';
import type {TransactionTransferPolicy,TransferRule,GovernedTransferPolicyRegistry} from '../../transfer/src/index.js';

export interface TransferPolicyGovernanceApproval {
  readonly decisionId:string;
  readonly policyId:string;
  readonly version:number;
  readonly transactionType:string;
  readonly title:TransferRule;
  readonly risk:TransferRule;
  readonly authorizedBy:ParticipantId;
  readonly authorityGrantId:string;
  readonly decisionAt:string;
  readonly evidenceIds:readonly EvidenceId[];
}

const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const sameRule=(a:TransferRule,b:TransferRule)=>a.dimension===b.dimension&&a.trigger===b.trigger&&a.eventType===b.eventType;

export class GovernedTransferApprovalStore {
  private readonly approvals=new Map<string,TransferPolicyGovernanceApproval>();
  put(approval:TransferPolicyGovernanceApproval):void{
    if(!approval.decisionId.trim()||!approval.policyId.trim()||approval.version<1||!Number.isInteger(approval.version)||!approval.transactionType.trim()) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_IDENTITY_INVALID');
    if(!validTime(approval.decisionAt)||approval.evidenceIds.length===0) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_EVIDENCE_REQUIRED');
    const key=`${approval.policyId}@${approval.version}`;
    if(this.approvals.has(key)) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_DUPLICATE');
    this.approvals.set(key,Object.freeze({...approval,title:Object.freeze({...approval.title}),risk:Object.freeze({...approval.risk}),evidenceIds:Object.freeze([...approval.evidenceIds])}));
  }
  get(policyId:string,version:number):TransferPolicyGovernanceApproval|undefined{return this.approvals.get(`${policyId}@${version}`);}
}

export class DecisionBoundTransferPolicyRatifier {
  constructor(private readonly registry:GovernedTransferPolicyRegistry,private readonly approvals:GovernedTransferApprovalStore){}
  ratify(policy:TransactionTransferPolicy):TransactionTransferPolicy{
    const approval=this.approvals.get(policy.id,policy.version);
    if(!approval) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_REQUIRED');
    if(approval.policyId!==policy.id||approval.version!==policy.version||approval.transactionType!==policy.transactionType) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_MISMATCH');
    if(!sameRule(approval.title,policy.title)||!sameRule(approval.risk,policy.risk)) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_MISMATCH');
    if(approval.authorizedBy!==policy.authorizedBy||approval.authorityGrantId!==policy.authorityGrantId) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_MISMATCH');
    if(!policy.evidenceIds.includes(approval.evidenceIds[0]!)) throw new Error('TRANSFER_GOVERNANCE_APPROVAL_EVIDENCE_NOT_BOUND');
    return this.registry.ratify(policy);
  }
}
