export type ReadinessDomain='AUTHORIZATION'|'PRIVACY_RETENTION'|'SECRETS_ENVIRONMENT'|'PAYMENT_PROVIDER'|'BACKUP_RESTORE'|'OBSERVABILITY'|'RUNBOOKS'|'TITLE_RISK_POLICY'|'ADVERSARIAL_REHEARSAL';
export type EvidenceStatus='PASS'|'BLOCKED'|'MISSING';
export interface ReadinessEvidence {readonly domain:ReadinessDomain;readonly status:EvidenceStatus;readonly evidenceRef?:string;readonly detail?:string;}
export interface ProductionEnvelope {readonly environment:'production';readonly provider:string;readonly policyVersion:string;readonly reviewedCommit:string;}
export interface ProductionAuthorization {readonly authorized:true;readonly envelope:ProductionEnvelope;readonly evidence:readonly ReadinessEvidence[];}

const REQUIRED:readonly ReadinessDomain[]=Object.freeze(['AUTHORIZATION','PRIVACY_RETENTION','SECRETS_ENVIRONMENT','PAYMENT_PROVIDER','BACKUP_RESTORE','OBSERVABILITY','RUNBOOKS','TITLE_RISK_POLICY','ADVERSARIAL_REHEARSAL']);
const FORBIDDEN_PRODUCTION_PROVIDERS=new Set(['SANDBOX_MOMO','SANDBOX','TEST','MOCK']);
const nonBlank=(v:string|undefined)=>typeof v==='string'&&v.trim().length>0;

export class ProductionReadinessGate{
 authorize(input:{envelope:ProductionEnvelope;evidence:readonly ReadinessEvidence[];unresolvedFindings?:readonly {severity:'P0'|'P1'|'P2';id:string}[]}):ProductionAuthorization{
  const {envelope}=input;
  if(envelope.environment!=='production') throw new Error('PRODUCTION_ENVIRONMENT_REQUIRED');
  if(!nonBlank(envelope.reviewedCommit)) throw new Error('PRODUCTION_REVIEWED_COMMIT_REQUIRED');
  if(!nonBlank(envelope.provider)) throw new Error('PRODUCTION_PROVIDER_REQUIRED');
  if(FORBIDDEN_PRODUCTION_PROVIDERS.has(envelope.provider.trim().toUpperCase())) throw new Error('SANDBOX_PROVIDER_FORBIDDEN_IN_PRODUCTION');
  if(!nonBlank(envelope.policyVersion)) throw new Error('TITLE_RISK_POLICY_VERSION_REQUIRED');
  const blockers=(input.unresolvedFindings??[]).filter(f=>f.severity==='P0'||f.severity==='P1');
  if(blockers.length) throw new Error(`UNRESOLVED_BLOCKING_FINDINGS:${blockers.map(f=>f.id).sort().join(',')}`);
  const byDomain=new Map<ReadinessDomain,ReadinessEvidence>();
  for(const item of input.evidence){
   if(byDomain.has(item.domain)) throw new Error(`READINESS_EVIDENCE_DUPLICATE:${item.domain}`);
   byDomain.set(item.domain,item);
  }
  for(const domain of REQUIRED){
   const item=byDomain.get(domain);
   if(!item) throw new Error(`READINESS_EVIDENCE_MISSING:${domain}`);
   if(item.status!=='PASS') throw new Error(`READINESS_EVIDENCE_NOT_PASS:${domain}:${item.status}`);
   if(!nonBlank(item.evidenceRef)) throw new Error(`READINESS_EVIDENCE_REFERENCE_REQUIRED:${domain}`);
  }
  const payment=byDomain.get('PAYMENT_PROVIDER')!;
  if(!payment.detail?.includes(envelope.provider)) throw new Error('PAYMENT_EVIDENCE_PROVIDER_MISMATCH');
  const policy=byDomain.get('TITLE_RISK_POLICY')!;
  if(!policy.detail?.includes(envelope.policyVersion)) throw new Error('TITLE_RISK_POLICY_EVIDENCE_MISMATCH');
  return Object.freeze({authorized:true as const,envelope:Object.freeze({...envelope}),evidence:Object.freeze(input.evidence.map(e=>Object.freeze({...e})))});
 }
}
