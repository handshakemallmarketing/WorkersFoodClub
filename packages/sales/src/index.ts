import type {EvidenceId,Money,OfferId,ParticipantId,Quantity,SpecificationId} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import {InMemoryCatalog} from '../../catalog/src/index.js';
import {InMemoryEconomicsLedger} from '../../economics/src/index.js';
import type {AuthorityGrantId} from '../../kernel/src/index.js';

export interface SalesWindow {
 readonly id:string;
 readonly place:string;
 readonly opensAt:string;
 readonly closesAt:string;
 readonly pickupStartsAt:string;
 readonly pickupEndsAt:string;
 readonly policyVersion:string;
 readonly evidenceIds:readonly EvidenceId[];
 readonly configuredBy:ParticipantId;
 readonly authorityGrantId:AuthorityGrantId;
}

export interface MemberCatalogView {
 readonly offerId:OfferId;
 readonly specificationId:SpecificationId;
 readonly displayName:string;
 readonly quantity:Quantity;
 readonly memberPrice:Money;
 readonly pickupPlace:string;
 readonly validUntil:string;
 readonly benchmark?:{value:Money;benchmarkId:string;benchmarkVersion:number;evidenceIds:readonly EvidenceId[]};
}

const time=(value:string)=>{const n=Date.parse(value);if(Number.isNaN(n)) throw new Error('SALES_WINDOW_TIME_INVALID');return n;};

export class GovernedSalesWindowRegistry {
 private readonly windows=new Map<string,SalesWindow>();
 constructor(private readonly authority:AuthorityEvaluator){}
 configure(input:SalesWindow):SalesWindow{
  if(this.windows.has(input.id)) throw new Error('SALES_WINDOW_ID_DUPLICATE');
  if(!input.place.trim()||!input.policyVersion.trim()||input.evidenceIds.length===0) throw new Error('SALES_WINDOW_GOVERNANCE_REQUIRED');
  const open=time(input.opensAt),close=time(input.closesAt),pickupStart=time(input.pickupStartsAt),pickupEnd=time(input.pickupEndsAt);
  if(close<=open||pickupEnd<=pickupStart||pickupStart<open) throw new Error('SALES_WINDOW_RANGE_INVALID');
  const decision=this.authority.evaluate({actorId:input.configuredBy,action:'sales-window.configure',targetId:`sales-window:${input.id}`,at:input.opensAt,grantIds:[input.authorityGrantId]});
  if(!decision.allowed||decision.grantId!==input.authorityGrantId) throw new Error('SALES_WINDOW_UNAUTHORIZED');
  const frozen=Object.freeze({...input,evidenceIds:[...input.evidenceIds]});this.windows.set(input.id,frozen);return frozen;
 }
 get(id:string){return this.windows.get(id);}
 isOpen(id:string,at:string){const w=this.windows.get(id);if(!w) return false;const t=time(at);return t>=time(w.opensAt)&&t<=time(w.closesAt);}
}

export class PilotMemberCatalogService {
 constructor(private readonly catalog:InMemoryCatalog,private readonly economics:InMemoryEconomicsLedger,private readonly windows:GovernedSalesWindowRegistry){}
 view(input:{windowId:string;listingId:string;offerId:OfferId;at:string;benchmarkValuationId?:string}):MemberCatalogView{
  if(!this.windows.isOpen(input.windowId,input.at)) throw new Error('SALES_WINDOW_CLOSED');
  const listing=this.catalog.getListing(input.listingId);if(!listing||!listing.active) throw new Error('CATALOG_LISTING_UNAVAILABLE');
  const offer=this.catalog.getOffer(input.offerId);if(!offer||!this.catalog.isOfferExecutable(input.offerId,input.at)) throw new Error('MEMBER_OFFER_UNAVAILABLE');
  if(offer.specificationId!==listing.specificationId) throw new Error('LISTING_OFFER_SPEC_MISMATCH');
  const spec=this.catalog.getSpecification(listing.specificationId);if(!spec) throw new Error('SPECIFICATION_UNKNOWN');
  const window=this.windows.get(input.windowId)!;if(offer.pickupPlace!==window.place) throw new Error('OFFER_WINDOW_PLACE_MISMATCH');
  let benchmark:MemberCatalogView['benchmark'];
  if(input.benchmarkValuationId){const v=this.economics.getBenchmarkValuation(input.benchmarkValuationId);if(!v) throw new Error('BENCHMARK_VALUATION_UNKNOWN');if(v.specificationId!==offer.specificationId||v.place!==offer.pickupPlace||v.quantity.unit!==offer.quantity.unit||v.quantity.amount!==offer.quantity.amount) throw new Error('BENCHMARK_DISPLAY_NOT_COMPARABLE');benchmark={value:v.comparableValue,benchmarkId:v.benchmarkId,benchmarkVersion:v.benchmarkVersion,evidenceIds:v.evidenceIds};}
  return Object.freeze({offerId:offer.id,specificationId:offer.specificationId,displayName:listing.displayName,quantity:offer.quantity,memberPrice:offer.memberPrice,pickupPlace:offer.pickupPlace,validUntil:offer.validUntil,...(benchmark?{benchmark}:{})});
 }
}
