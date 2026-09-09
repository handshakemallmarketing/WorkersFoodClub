import type {AuthorityGrantId,EvidenceId,Money,OfferId,ParticipantId,Quantity,Specification,SpecificationId} from '../../kernel/src/index.js';
import {AuthorityEvaluator} from '../../authority/src/index.js';
import {InMemoryCatalog,type CatalogListing,type MemberOffer,type PriceObservation} from '../../catalog/src/index.js';

export interface SalesWindow {
 readonly id:string;
 readonly validFrom:string;
 readonly validUntil:string;
 readonly pickupPlace:string;
 readonly active:boolean;
 readonly policyVersion:string;
 readonly createdBy:ParticipantId;
}

export interface BenchmarkDisplay {
 readonly id:string;
 readonly specificationId:SpecificationId;
 readonly priceEvidenceId:EvidenceId;
 readonly value:Money;
 readonly basis:Quantity;
 readonly place:string;
 readonly observedAt:string;
 readonly transactionLevel:'FARMGATE'|'WHOLESALE'|'RETAIL'|'MEMBER';
 readonly conditions:readonly string[];
 readonly methodVersion:string;
 readonly disclaimer:'REFERENCE_ONLY_NOT_FINAL_SAVINGS';
}

export interface CatalogPublicationContext {
 readonly actorId:ParticipantId;
 readonly grantIds:readonly AuthorityGrantId[];
 readonly at:string;
}

const validTime=(value:string)=>{const n=Date.parse(value);if(Number.isNaN(n)) throw new Error('TIME_INVALID');return n;};
const requireText=(value:string,error:string)=>{if(!value.trim()) throw new Error(error);};

export class GovernedPilotCatalogService {
 private readonly windows=new Map<string,SalesWindow>();
 private readonly observedPrices=new Map<EvidenceId,PriceObservation>();
 private readonly benchmarks=new Map<string,BenchmarkDisplay>();
 private readonly benchmarkByOffer=new Map<OfferId,string>();
 constructor(private readonly authority:AuthorityEvaluator,private readonly catalog:InMemoryCatalog){}

 private authorize(ctx:CatalogPublicationContext,action:string,targetId:string,quantity?:number){
  const decision=this.authority.evaluate({actorId:ctx.actorId,action,targetId,at:ctx.at,grantIds:ctx.grantIds,quantity});
  if(!decision.allowed) throw new Error(`CATALOG_UNAUTHORIZED:${decision.reason}`);
  return decision;
 }

 publishSpecification(ctx:CatalogPublicationContext,spec:Specification){
  this.authorize(ctx,'catalog.specification.publish',String(spec.id));
  return this.catalog.publishSpecification(spec);
 }

 publishListing(ctx:CatalogPublicationContext,listing:CatalogListing){
  this.authorize(ctx,'catalog.listing.publish',listing.listingId);
  return this.catalog.publishListing(listing);
 }

 recordPriceObservation(ctx:CatalogPublicationContext,observation:PriceObservation){
  this.authorize(ctx,'catalog.price.observe',String(observation.specificationId));
  const recorded=this.catalog.recordPriceObservation(observation);
  this.observedPrices.set(recorded.evidenceId,recorded);
  return recorded;
 }

 createSalesWindow(ctx:CatalogPublicationContext,input:SalesWindow){
  this.authorize(ctx,'catalog.sales-window.publish',input.id);
  if(this.windows.has(input.id)) throw new Error('SALES_WINDOW_ID_DUPLICATE');
  const from=validTime(input.validFrom),until=validTime(input.validUntil);
  if(until<=from) throw new Error('SALES_WINDOW_TIME_INVALID');
  requireText(input.pickupPlace,'SALES_WINDOW_PLACE_REQUIRED');
  requireText(input.policyVersion,'SALES_WINDOW_POLICY_REQUIRED');
  if(input.createdBy!==ctx.actorId) throw new Error('SALES_WINDOW_ACTOR_MISMATCH');
  const frozen=Object.freeze({...input});this.windows.set(input.id,frozen);return frozen;
 }

 defineBenchmarkDisplay(ctx:CatalogPublicationContext,input:{id:string;specificationId:SpecificationId;priceEvidenceId:EvidenceId;methodVersion:string}){
  this.authorize(ctx,'catalog.benchmark.publish',input.id);
  if(this.benchmarks.has(input.id)) throw new Error('BENCHMARK_DISPLAY_ID_DUPLICATE');
  const observation=this.observedPrices.get(input.priceEvidenceId);
  if(!observation) throw new Error('BENCHMARK_PRICE_EVIDENCE_UNKNOWN');
  if(observation.specificationId!==input.specificationId) throw new Error('BENCHMARK_SPECIFICATION_MISMATCH');
  requireText(input.methodVersion,'BENCHMARK_METHOD_REQUIRED');
  const display:BenchmarkDisplay=Object.freeze({id:input.id,specificationId:input.specificationId,priceEvidenceId:input.priceEvidenceId,value:observation.price,basis:observation.basis,place:observation.place,observedAt:observation.observedAt,transactionLevel:observation.transactionLevel,conditions:Object.freeze([...observation.conditions]),methodVersion:input.methodVersion,disclaimer:'REFERENCE_ONLY_NOT_FINAL_SAVINGS'});
  this.benchmarks.set(input.id,display);return display;
 }

 publishOffer(ctx:CatalogPublicationContext,input:{offer:MemberOffer;salesWindowId:string;benchmarkDisplayId:string}){
  this.authorize(ctx,'catalog.offer.publish',String(input.offer.id),input.offer.quantity.amount);
  const window=this.windows.get(input.salesWindowId);if(!window||!window.active) throw new Error('SALES_WINDOW_INACTIVE');
  const benchmark=this.benchmarks.get(input.benchmarkDisplayId);if(!benchmark) throw new Error('BENCHMARK_DISPLAY_UNKNOWN');
  if(benchmark.specificationId!==input.offer.specificationId) throw new Error('OFFER_BENCHMARK_SPECIFICATION_MISMATCH');
  if(input.offer.pickupPlace!==window.pickupPlace) throw new Error('OFFER_WINDOW_PLACE_MISMATCH');
  if(validTime(input.offer.validFrom)<validTime(window.validFrom)||validTime(input.offer.validUntil)>validTime(window.validUntil)) throw new Error('OFFER_OUTSIDE_SALES_WINDOW');
  if(!input.offer.priceEvidenceIds.includes(benchmark.priceEvidenceId)) throw new Error('OFFER_BENCHMARK_EVIDENCE_NOT_RETAINED');
  const published=this.catalog.publishMemberOffer(input.offer);
  this.benchmarkByOffer.set(input.offer.id,input.benchmarkDisplayId);
  return published;
 }

 catalogView(input:{listingId:string;offerId:OfferId;benchmarkDisplayId:string;at:string}){
  const listing=this.catalog.getListing(input.listingId);if(!listing||!listing.active) throw new Error('LISTING_INACTIVE');
  const offer=this.catalog.getOffer(input.offerId);if(!offer||!this.catalog.isOfferExecutable(input.offerId,input.at)) throw new Error('OFFER_NOT_EXECUTABLE');
  const publishedBenchmarkId=this.benchmarkByOffer.get(input.offerId);if(!publishedBenchmarkId||publishedBenchmarkId!==input.benchmarkDisplayId) throw new Error('CATALOG_VIEW_BENCHMARK_MISMATCH');
  const benchmark=this.benchmarks.get(input.benchmarkDisplayId);if(!benchmark) throw new Error('BENCHMARK_DISPLAY_UNKNOWN');
  if(listing.specificationId!==offer.specificationId||benchmark.specificationId!==offer.specificationId) throw new Error('CATALOG_VIEW_SPECIFICATION_MISMATCH');
  return Object.freeze({listing,offer,benchmark});
 }
}
