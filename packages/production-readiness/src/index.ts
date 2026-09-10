export type ReadinessDomain='AUTHORIZATION'|'PRIVACY_RETENTION'|'SECRETS_ENVIRONMENT'|'PAYMENT_PROVIDER'|'BACKUP_RESTORE'|'OBSERVABILITY'|'RUNBOOKS'|'TITLE_RISK_POLICY'|'ADVERSARIAL_REHEARSAL';
export type EvidenceStatus='PASS'|'BLOCKED'|'MISSING';
export interface ReadinessEvidence {readonly domain:ReadinessDomain;readonly status:EvidenceStatus;readonly evidenceRef?:string;readonly detail?:string;}
export interface ProductionEnvelope {readonly environment:'production';readonly provider:string;readonly policyVersion:string;readonly reviewedCommit:string;}
export interface ProductionAuthorization {readonly authorized:true;readonly envelope:ProductionEnvelope;readonly evidence:readonly ReadinessEvidence[];}

const REQUIRED:readonly ReadinessDomain[]=Object.freeze(['AUTHORIZATION','PRIVACY_RETENTION','SECRETS_ENVIRONMENT','PAYMENT_PROVIDER','BACKUP_RESTORE','OBSERVABILITY','RUNBOOKS','TITLE_RISK_POLICY','ADVERSARIAL_REHEARSAL']);
const FORBIDDEN_PRODUCTION_PROVIDERS=new Set(['SANDBOX_MOMO','SANDBOX','TEST','MOCK']);
const nonBlank=(v:string|undefined)=>typeof v==='string'&&v.trim().length>0;

export type RuntimeEnvironment='development'|'test'|'staging'|'production';
export interface RuntimeConfigurationInput {readonly environment:string|undefined;readonly paymentProvider:string|undefined;readonly webhookSecret:string|undefined;readonly databaseUrl:string|undefined;readonly observabilityToken?:string|undefined;}
export interface RuntimeConfiguration {readonly environment:RuntimeEnvironment;readonly paymentProvider:string;readonly webhookSecret:string;readonly databaseUrl:string;readonly observabilityToken?:string;}

const SANDBOX_PROVIDER_MARKERS=['SANDBOX','TEST','MOCK'];
const secretLikeKeys=new Set(['authorization','cookie','set-cookie','password','passwd','secret','token','access_token','refresh_token','api_key','apikey','database_url','databaseurl','webhooksecret','webhook_secret']);
const sensitiveKeys=new Set(['eligibilitydocument','eligibility_document','verificationdocument','verification_document','nationalid','national_id','ssn','passwordhash','password_hash']);
const REDACTED='[REDACTED]';
const isSandboxProvider=(provider:string)=>SANDBOX_PROVIDER_MARKERS.some(marker=>provider.toUpperCase().includes(marker));
const parseEnvironment=(value:string|undefined):RuntimeEnvironment=>{
 if(!nonBlank(value)) throw new Error('RUNTIME_ENVIRONMENT_REQUIRED');
 const normalized=value!.trim().toLowerCase();
 if(!['development','test','staging','production'].includes(normalized)) throw new Error('RUNTIME_ENVIRONMENT_INVALID');
 return normalized as RuntimeEnvironment;
};

export class RuntimeConfigurationGate{
 validate(input:RuntimeConfigurationInput):RuntimeConfiguration{
  const environment=parseEnvironment(input.environment);
  if(!nonBlank(input.paymentProvider)) throw new Error('PAYMENT_PROVIDER_CONFIGURATION_REQUIRED');
  if(!nonBlank(input.databaseUrl)) throw new Error('DATABASE_URL_REQUIRED');
  if(!nonBlank(input.webhookSecret)) throw new Error('PAYMENT_WEBHOOK_SECRET_REQUIRED');
  const paymentProvider=input.paymentProvider!.trim();
  if(environment==='production'&&isSandboxProvider(paymentProvider)) throw new Error('SANDBOX_PROVIDER_FORBIDDEN_IN_PRODUCTION');
  if(environment!=='production'&&!isSandboxProvider(paymentProvider)) throw new Error('LIVE_PROVIDER_FORBIDDEN_OUTSIDE_PRODUCTION');
  const db=input.databaseUrl!.trim();
  if(environment==='production'&&/(localhost|127\.0\.0\.1|test|sandbox|dev)/i.test(db)) throw new Error('NON_PRODUCTION_DATABASE_FORBIDDEN_IN_PRODUCTION');
  if(environment==='production'&&input.observabilityToken!==undefined&&!nonBlank(input.observabilityToken)) throw new Error('OBSERVABILITY_TOKEN_INVALID');
  return Object.freeze({environment,paymentProvider,webhookSecret:input.webhookSecret!.trim(),databaseUrl:db,...(input.observabilityToken!==undefined?{observabilityToken:input.observabilityToken.trim()}: {})});
 }
}

const normalizeKey=(key:string)=>key.replace(/[^a-zA-Z0-9_]/g,'').toLowerCase();
export const redactOperationalValue=(value:unknown):unknown=>{
 if(value===null||value===undefined) return value;
 if(Array.isArray(value)) return Object.freeze(value.map(redactOperationalValue));
 if(typeof value==='object'){
  const out:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
   const normalized=normalizeKey(key);
   out[key]=(secretLikeKeys.has(normalized)||sensitiveKeys.has(normalized))?REDACTED:redactOperationalValue(item);
  }
  return Object.freeze(out);
 }
 return value;
};

export class SafeOperationalLogger{
 private readonly entries:unknown[]=[];
 record(event:unknown):unknown{
  const safe=redactOperationalValue(event);
  this.entries.push(safe);
  return safe;
 }
 all():readonly unknown[]{return Object.freeze([...this.entries]);}
}

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
