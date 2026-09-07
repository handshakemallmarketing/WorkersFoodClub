export type Brand<T, B extends string> = T & { readonly __brand: B };
export type ParticipantId = Brand<string,'ParticipantId'>;
export type ResourceId = Brand<string,'ResourceId'>;
export type SpecificationId = Brand<string,'SpecificationId'>;
export type LotId = Brand<string,'LotId'>;
export type ObligationId = Brand<string,'ObligationId'>;
export type AuthorityGrantId = Brand<string,'AuthorityGrantId'>;
export type ExposureId = Brand<string,'ExposureId'>;
export type ConstraintId = Brand<string,'ConstraintId'>;
export type EventId = Brand<string,'EventId'>;
export type EvidenceId = Brand<string,'EvidenceId'>;
export type PropositionId = Brand<string,'PropositionId'>;
export type ClaimId = Brand<string,'ClaimId'>;
export type OfferId = Brand<string,'OfferId'>;
export type CommandId = Brand<string,'CommandId'>;

export const asId = <B extends string>(value:string): Brand<string,B> => {
  if (!value || !value.trim()) throw new Error('ID_EMPTY');
  return value as Brand<string,B>;
};

export type Unit = 'kg'|'g'|'l'|'ml'|'unit'|'bag'|'crate';
export interface Quantity { readonly amount:number; readonly unit:Unit }
export function quantity(amount:number, unit:Unit):Quantity {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('QUANTITY_INVALID');
  return Object.freeze({amount,unit});
}
export function sameUnit(a:Quantity,b:Quantity):void { if(a.unit!==b.unit) throw new Error('UNIT_MISMATCH'); }
export function addQuantity(a:Quantity,b:Quantity):Quantity { sameUnit(a,b); return quantity(a.amount+b.amount,a.unit); }
export function subtractQuantity(a:Quantity,b:Quantity):Quantity { sameUnit(a,b); if(b.amount>a.amount) throw new Error('NEGATIVE_PHYSICAL_TRUTH'); return quantity(a.amount-b.amount,a.unit); }

export type Currency = 'GHS'|'USD';
export interface Money { readonly minor:bigint; readonly currency:Currency }
export function money(minor:bigint,currency:Currency):Money { if(minor<0n) throw new Error('MONEY_NEGATIVE'); return Object.freeze({minor,currency}); }

export interface TimeCoordinates { readonly occurredAt:string; readonly recordedAt:string; readonly effectiveAt?:string }
export function isoTime(value:string):string { if(Number.isNaN(Date.parse(value))) throw new Error('TIME_INVALID'); return value; }

export interface Participant { readonly id:ParticipantId; readonly kind:'PERSON'|'ORGANIZATION'|'SYSTEM' }
export interface Resource { readonly id:ResourceId; readonly resourceType:'PHYSICAL_GOOD'|'MONEY'|'CAPACITY'|'RIGHT' }
export interface Specification { readonly id:SpecificationId; readonly version:number; readonly name:string; readonly baseUnit:Unit }
export interface TraceabilityLot { readonly id:LotId; readonly specificationId:SpecificationId; readonly quantity:Quantity }
export interface Obligation { readonly id:ObligationId; readonly obligor:ParticipantId; readonly beneficiary:ParticipantId; readonly specificationId:SpecificationId; readonly quantity:Quantity; readonly state:'OPEN'|'PARTIALLY_DISCHARGED'|'DISCHARGED'|'BREACHED' }
export interface Exposure { readonly id:ExposureId; readonly subjectId:string; readonly consequence:string; readonly horizon:string }
export interface Constraint { readonly id:ConstraintId; readonly kind:'HARD'|'SOFT'; readonly rule:string }
export interface Proposition { readonly id:PropositionId; readonly statement:string; readonly status:'OBSERVED'|'PROPOSED'|'TESTED'|'ACCEPTED'|'RATIFIED'|'CHALLENGED'|'AMENDED'|'RETIRED' }
export interface Claim { readonly id:ClaimId; readonly claimantId:ParticipantId; readonly subjectId:string; readonly assertion:string; readonly state:'ASSERTED'|'UNDER_REVIEW'|'VALIDATED'|'REJECTED'|'PARTIALLY_VALIDATED'|'RESOLVED' }
export interface Offer { readonly id:OfferId; readonly offerorId:ParticipantId; readonly specificationId:SpecificationId; readonly quantity:Quantity; readonly validFrom:string; readonly validUntil:string }

export type LineageKind='DERIVED_FROM'|'SUPERSEDES'|'CORRECTS'|'SPLIT_FROM'|'MERGED_FROM'|'TRANSFORMED_FROM';
export interface LineageEdge { readonly fromId:string; readonly toId:string; readonly kind:LineageKind }

export interface CanonicalEvent<T=unknown> { readonly id:EventId; readonly type:string; readonly schemaVersion:number; readonly actorId:ParticipantId; readonly targetIds:readonly string[]; readonly time:TimeCoordinates; readonly correlationId:string; readonly causationId?:string; readonly evidenceIds:readonly EvidenceId[]; readonly payload:T }
export type EvidenceGrade='E0'|'E1'|'E2'|'E3'|'E4';
export type EvidenceKind='OBSERVATION'|'ASSERTION'|'MEASUREMENT'|'PROVIDER_MESSAGE'|'MODEL_OUTPUT'|'DOCUMENT';
export interface Evidence<T=unknown> { readonly id:EvidenceId; readonly kind:EvidenceKind; readonly source:string; readonly observedAt:string; readonly recordedAt:string; readonly effectiveAt?:string; readonly scope:string; readonly grade:EvidenceGrade; readonly payload:T; readonly rawRef?:string; readonly supersedes?:EvidenceId }
