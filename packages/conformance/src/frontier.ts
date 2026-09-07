import type {Money} from '../../kernel/src/index.js';

export type SettlementKind='REFUND'|'REMEDY_CREDIT';
export const assertSettlementType=(expected:SettlementKind,actual:SettlementKind)=>{if(expected!==actual)throw new Error('SETTLEMENT_TYPE_MISMATCH');return actual;};

export interface LiquidityClassification{readonly deployable:Money;readonly restrictedPrepayment:Money;readonly reportedDeployable:Money;}
export const assertRestrictedPrepayment=(x:LiquidityClassification)=>{if(x.deployable.currency!==x.restrictedPrepayment.currency||x.deployable.currency!==x.reportedDeployable.currency)throw new Error('LIQUIDITY_CURRENCY_MISMATCH');const maximum=x.deployable.minor;if(x.reportedDeployable.minor>maximum)throw new Error('RESTRICTED_PREPAYMENT_MISCLASSIFIED');return x;};

export interface ProviderSemanticMapping{readonly provider:string;readonly providerVersion:string;readonly externalStatus:string;readonly canonicalMeaning:string|null;readonly mappingVersion:string;readonly evidenceIds:readonly string[];}
export const mapExternalSemantic=(x:ProviderSemanticMapping)=>{if(!x.provider.trim()||!x.providerVersion.trim()||!x.externalStatus.trim()||!x.mappingVersion.trim()||x.evidenceIds.length===0)throw new Error('PROVIDER_MAPPING_EVIDENCE_REQUIRED');if(x.canonicalMeaning===null||!x.canonicalMeaning.trim())throw new Error('PROVIDER_SEMANTIC_UNMAPPED');return Object.freeze({...x,evidenceIds:[...x.evidenceIds]});};

export type TriState<T>=Readonly<{known:true;value:T}|{known:false}>;
export const migrateOptionalBoolean=(value:boolean|null|undefined):TriState<boolean>=>value===null||value===undefined?Object.freeze({known:false}):Object.freeze({known:true,value});
export const migrateOptionalNumber=(value:number|null|undefined):TriState<number>=>value===null||value===undefined?Object.freeze({known:false}):Object.freeze({known:true,value});

export interface ConflictingAcceptanceEvidence{readonly providerEvidenceId:string;readonly memberEvidenceId:string;readonly providerSaysDelivered:boolean;readonly memberAccepts:boolean;}
export const resolveAcceptanceConflict=(x:ConflictingAcceptanceEvidence)=>{if(!x.providerEvidenceId.trim()||!x.memberEvidenceId.trim())throw new Error('ACCEPTANCE_EVIDENCE_REQUIRED');if(x.providerSaysDelivered&&!x.memberAccepts)return Object.freeze({state:'DISPUTED' as const,evidenceIds:[x.providerEvidenceId,x.memberEvidenceId]});return Object.freeze({state:x.memberAccepts?'ACCEPTED' as const:'OPEN' as const,evidenceIds:[x.providerEvidenceId,x.memberEvidenceId]});};
