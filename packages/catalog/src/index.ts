import type {EvidenceId,Money,OfferId,ParticipantId,Quantity,Specification,SpecificationId} from '../../kernel/src/index.js';

export type TransactionLevel='FARMGATE'|'WHOLESALE'|'RETAIL'|'MEMBER';

export interface PriceObservation {
 readonly evidenceId:EvidenceId;
 readonly specificationId:SpecificationId;
 readonly price:Money;
 readonly basis:Quantity;
 readonly place:string;
 readonly observedAt:string;
 readonly transactionLevel:TransactionLevel;
 readonly conditions:readonly string[];
}

export function priceObservation(input:PriceObservation):PriceObservation {
 if(!input.place.trim()) throw new Error('PRICE_PLACE_REQUIRED');
 if(Number.isNaN(Date.parse(input.observedAt))) throw new Error('PRICE_TIME_INVALID');
 if(input.basis.amount<=0) throw new Error('PRICE_BASIS_INVALID');
 return Object.freeze({...input,conditions:[...input.conditions]});
}

export interface CatalogListing {
 readonly listingId:string;
 readonly sku:string;
 readonly specificationId:SpecificationId;
 readonly displayName:string;
 readonly active:boolean;
}

export interface MemberOffer {
 readonly id:OfferId;
 readonly offerorId:ParticipantId;
 readonly specificationId:SpecificationId;
 readonly quantity:Quantity;
 readonly memberPrice:Money;
 readonly priceBasis:Quantity;
 readonly pickupPlace:string;
 readonly validFrom:string;
 readonly validUntil:string;
 readonly priceEvidenceIds:readonly EvidenceId[];
 readonly policyVersions:readonly string[];
}

export class InMemoryCatalog {
 private specifications=new Map<SpecificationId,Specification>();
 private listings=new Map<string,CatalogListing>();
 private priceEvidence=new Map<EvidenceId,PriceObservation>();
 private offers=new Map<OfferId,MemberOffer>();
 publishSpecification(spec:Specification):Specification{
  const current=this.specifications.get(spec.id);
  if(current && spec.version<=current.version) throw new Error('SPECIFICATION_VERSION_NOT_ADVANCED');
  this.specifications.set(spec.id,Object.freeze({...spec})); return spec;
 }
 publishListing(listing:CatalogListing):CatalogListing{
  if(!this.specifications.has(listing.specificationId)) throw new Error('LISTING_SPECIFICATION_UNKNOWN');
  if(!listing.sku.trim()) throw new Error('SKU_EMPTY');
  this.listings.set(listing.listingId,Object.freeze({...listing})); return listing;
 }
 recordPriceObservation(observation:PriceObservation):PriceObservation{
  if(!this.specifications.has(observation.specificationId)) throw new Error('PRICE_SPECIFICATION_UNKNOWN');
  if(this.priceEvidence.has(observation.evidenceId)) throw new Error('PRICE_EVIDENCE_DUPLICATE');
  const valid=priceObservation(observation); this.priceEvidence.set(valid.evidenceId,valid); return valid;
 }
 publishMemberOffer(offer:MemberOffer):MemberOffer{
  if(!this.specifications.has(offer.specificationId)) throw new Error('OFFER_SPECIFICATION_UNKNOWN');
  if(Number.isNaN(Date.parse(offer.validFrom))||Number.isNaN(Date.parse(offer.validUntil))||Date.parse(offer.validUntil)<=Date.parse(offer.validFrom)) throw new Error('OFFER_VALIDITY_INVALID');
  if(!offer.pickupPlace.trim()) throw new Error('OFFER_PLACE_REQUIRED');
  if(offer.quantity.amount<=0 || offer.priceBasis.amount<=0) throw new Error('OFFER_QUANTITY_INVALID');
  if(offer.priceEvidenceIds.length===0) throw new Error('OFFER_PRICE_EVIDENCE_REQUIRED');
  for(const evidenceId of offer.priceEvidenceIds){ const p=this.priceEvidence.get(evidenceId); if(!p) throw new Error('OFFER_PRICE_EVIDENCE_UNKNOWN'); if(p.specificationId!==offer.specificationId) throw new Error('OFFER_PRICE_EVIDENCE_SPEC_MISMATCH'); }
  if(this.offers.has(offer.id)) throw new Error('OFFER_ID_DUPLICATE');
  const frozen=Object.freeze({...offer,priceEvidenceIds:[...offer.priceEvidenceIds],policyVersions:[...offer.policyVersions]}); this.offers.set(offer.id,frozen); return frozen;
 }
 isOfferExecutable(id:OfferId,at:string):boolean{
  const o=this.offers.get(id); if(!o) return false; const t=Date.parse(at); if(Number.isNaN(t)) throw new Error('TIME_INVALID'); return t>=Date.parse(o.validFrom)&&t<=Date.parse(o.validUntil);
 }
 getSpecification(id:SpecificationId){ return this.specifications.get(id); }
 getListing(id:string){ return this.listings.get(id); }
 getOffer(id:OfferId){ return this.offers.get(id); }
}
