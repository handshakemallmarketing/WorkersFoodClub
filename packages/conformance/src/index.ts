export const BASELINE='CB-00-v0.1' as const;
export function constitutionalFail(id:string, reason:string): never { throw new Error(`${id}: ${reason}`); }

export type CanonicalProviderStatus='PENDING'|'CONFIRMED'|'FAILED'|'REVERSED'|'UNKNOWN';
export interface ProviderStatusMap{readonly provider:string;readonly version:string;readonly mappings:Readonly<Record<string,Exclude<CanonicalProviderStatus,'UNKNOWN'>>>;}
export function mapProviderStatus(map:ProviderStatusMap,rawStatus:string):CanonicalProviderStatus{
 if(!map.provider.trim()||!map.version.trim())throw new Error('PROVIDER_MAPPING_IDENTITY_REQUIRED');
 const mapped=map.mappings[rawStatus];return mapped??'UNKNOWN';
}

export type MigratedBoolean='TRUE'|'FALSE'|'UNKNOWN';
export function migrateNullableBoolean(value:boolean|null|undefined):MigratedBoolean{
 return value===true?'TRUE':value===false?'FALSE':'UNKNOWN';
}

export interface LiquidityProjection{readonly deployableMinor:bigint;readonly restrictedMinor:bigint;readonly currency:string;}
export function projectLiquidity(entries:readonly {minor:bigint;currency:string;classification:'UNRESTRICTED_CAPITAL'|'RESTRICTED_MEMBER_PREPAYMENT'}[]):LiquidityProjection{
 if(entries.length===0)return Object.freeze({deployableMinor:0n,restrictedMinor:0n,currency:'GHS'});
 const currency=entries[0]!.currency;if(entries.some(x=>x.currency!==currency||x.minor<0n))throw new Error('LIQUIDITY_ENTRY_INVALID');
 let deployableMinor=0n,restrictedMinor=0n;for(const x of entries){if(x.classification==='RESTRICTED_MEMBER_PREPAYMENT')restrictedMinor+=x.minor;else deployableMinor+=x.minor;}
 return Object.freeze({deployableMinor,restrictedMinor,currency});
}

export type DeliveryResolution='UNCONFIRMED'|'ACCEPTED'|'DISPUTED';
export function resolveDeliveryEvidence(input:{providerDelivered:boolean;memberAccepted:boolean;memberDisputed:boolean}):DeliveryResolution{
 if(input.memberDisputed)return 'DISPUTED';if(input.memberAccepted)return 'ACCEPTED';return 'UNCONFIRMED';
}
