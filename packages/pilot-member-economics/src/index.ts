import type {EvidenceId,Money,ObligationId,OfferId,ParticipantId,Quantity,SpecificationId} from '../../kernel/src/index.js';
import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';
import {InMemoryEconomicsLedger,type FulfilledMemberEconomics,type SavingsEntry} from '../../economics/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../resolution/src/index.js';
import type {InMemoryRemedyLedger} from '../../remedy/src/index.js';
import type {CanonicalProjectionRecord,ProjectionDefinition} from '../../projections/src/index.js';
import type {GovernedPilotCatalogService} from '../../pilot-catalog/src/index.js';

const QUANTITY_SIGNIFICANT_DIGITS=12;
const normalizeAmount=(value:number)=>{
 if(!Number.isFinite(value)||value<=0) throw new Error('GOVERNED_BENCHMARK_QUANTITY_MISMATCH');
 const normalized=Number.parseFloat(value.toPrecision(QUANTITY_SIGNIFICANT_DIGITS));
 if(!Number.isFinite(normalized)||normalized<=0) throw new Error('GOVERNED_BENCHMARK_QUANTITY_MISMATCH');
 return normalized;
};
const sameMoney=(a:Money,b:Money)=>a.currency===b.currency&&a.minor===b.minor;
const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const sameEvidence=(actual:readonly EvidenceId[],expected:readonly EvidenceId[])=>actual.length===expected.length&&new Set(actual.map(String)).size===actual.length&&actual.every(id=>expected.some(x=>String(x)===String(id)));
const decimalFraction=(value:number)=>{
 const normalized=normalizeAmount(value);
 const [mantissa,exponentText]=normalized.toString().toLowerCase().split('e');
 const exponent=Number(exponentText??'0');
 const [whole,fraction='']=mantissa!.split('.');
 const numeratorBase=BigInt(`${whole}${fraction}`);
 const shift=exponent-fraction.length;
 return shift>=0?{numerator:numeratorBase*(10n**BigInt(shift)),denominator:1n}:{numerator:numeratorBase,denominator:10n**BigInt(-shift)};
};
const prorateMinor=(minor:bigint,actual:number,basis:number)=>{const a=decimalFraction(actual),b=decimalFraction(basis);return minor*a.numerator*b.denominator/(a.denominator*b.numerator);};

export class GovernedMemberEconomicsService{
 constructor(
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'|'paymentsFor'>,
  private readonly resolution:InMemoryObligationResolutionLedger,
  private readonly economics:InMemoryEconomicsLedger,
  private readonly remedies?:Pick<InMemoryRemedyLedger,'completedRemediesFor'>,
  private readonly catalog?:Pick<GovernedPilotCatalogService,'benchmarkForOffer'|'historicalOfferContext'>
 ){}
 recordFulfilledEconomics(input:FulfilledMemberEconomics){
  const commitment=this.demand.getCommitment(input.obligationId);
  if(!commitment) throw new Error('MEMBER_ECONOMICS_OBLIGATION_UNKNOWN');
  if(input.participantId!==commitment.participantId) throw new Error('MEMBER_ECONOMICS_PARTICIPANT_MISMATCH');
  if(input.specificationId!==commitment.obligation.specificationId) throw new Error('MEMBER_ECONOMICS_SPECIFICATION_MISMATCH');
  if(!this.catalog) throw new Error('MEMBER_ECONOMICS_CATALOG_REQUIRED');
  const benchmark=this.catalog.benchmarkForOffer(commitment.offerId);
  if(!benchmark)throw new Error('MEMBER_ECONOMICS_BENCHMARK_CONTEXT_UNKNOWN');
  if(input.place!==benchmark.place||input.serviceLevel!=='pickup')throw new Error('MEMBER_ECONOMICS_COMPARISON_CONTEXT_NOT_CANONICAL');
  const position=this.resolution.position({id:commitment.obligation.id,quantity:commitment.obligation.quantity});
  const completed=this.remedies?.completedRemediesFor(input.obligationId)??[];
  const replacements=completed.filter(x=>x.remedy.kind==='REPLACEMENT').reduce((n,x)=>n+x.completion.quantity.amount,0);
  const actualAmount=normalizeAmount(position.performedQuantity.amount+replacements);
  const inputAmount=normalizeAmount(input.quantity.amount);
  if(input.quantity.unit!==position.performedQuantity.unit||inputAmount!==actualAmount) throw new Error('MEMBER_ECONOMICS_NOT_ACTUAL_PERFORMANCE');
  const canonicalQuantity:Quantity=Object.freeze({amount:actualAmount,unit:position.performedQuantity.unit});

  const confirmed=this.demand.paymentsFor(input.obligationId).filter(p=>p.status==='CONFIRMED');
  if(confirmed.length===0) throw new Error('MEMBER_ECONOMICS_CONFIRMED_PAYMENT_REQUIRED');
  const currency=confirmed[0]!.amount.currency;
  if(confirmed.some(p=>p.amount.currency!==currency)) throw new Error('MEMBER_ECONOMICS_PAYMENT_CURRENCY_MISMATCH');
  const paid:Money=Object.freeze({minor:confirmed.reduce((n,p)=>n+p.amount.minor,0n),currency});
  const committedPrice=(commitment as typeof commitment&{committedMemberPrice?:Money}).committedMemberPrice;
  if(committedPrice&&!sameMoney(paid,committedPrice)) throw new Error('MEMBER_ECONOMICS_PAYMENT_TOTAL_MISMATCH');
  if(!sameMoney(input.goodsOutlay,paid)) throw new Error('MEMBER_ECONOMICS_OUTLAY_NOT_CANONICAL');
  if(input.mandatoryCharges.minor!==0n||input.mandatoryCharges.currency!==currency) throw new Error('MEMBER_ECONOMICS_CHARGES_NOT_CANONICAL');

  const refunds=completed.filter(x=>x.remedy.kind==='REFUND');
  if(refunds.some(x=>!x.completion.settlementAmount)) throw new Error('MEMBER_ECONOMICS_REFUND_SETTLEMENT_MISSING');
  if(refunds.some(x=>x.completion.settlementAmount!.currency!==currency)) throw new Error('MEMBER_ECONOMICS_REFUND_CURRENCY_MISMATCH');
  const refund:Money=Object.freeze({minor:refunds.reduce((n,x)=>n+x.completion.settlementAmount!.minor,0n),currency});
  if(!sameMoney(input.refundApplied,refund)) throw new Error('MEMBER_ECONOMICS_REFUND_NOT_CANONICAL');
  const canonicalEvidence:EvidenceId[]=[...confirmed.map(p=>p.evidenceId),...refunds.flatMap(x=>x.completion.evidenceIds)];
  if(!sameEvidence(input.economicEvidenceIds,canonicalEvidence)) throw new Error('MEMBER_ECONOMICS_EVIDENCE_NOT_CANONICAL');
  if(!validTime(input.realizedAt)||Date.parse(input.realizedAt)<Date.parse(commitment.acceptedAt)) throw new Error('MEMBER_ECONOMICS_TIME_INVALID');
  return this.economics.recordFulfilledMemberEconomics({...input,quantity:canonicalQuantity});
 }
 recordGovernedSavingsBenchmark(input:{benchmarkId:string;benchmarkVersion:number;valuationId:string;obligationId:ObligationId;offerId:OfferId;benchmarkDisplayId:string;listingId?:string}){
  if(!this.catalog) throw new Error('GOVERNED_BENCHMARK_CATALOG_REQUIRED');
  const commitment=this.demand.getCommitment(input.obligationId);
  if(!commitment) throw new Error('GOVERNED_BENCHMARK_OBLIGATION_UNKNOWN');
  if(commitment.offerId!==input.offerId) throw new Error('GOVERNED_BENCHMARK_OFFER_MISMATCH');
  const context=this.catalog.historicalOfferContext(input.offerId,input.benchmarkDisplayId);
  const {offer,benchmark}=context;
  const acceptedAt=Date.parse(commitment.acceptedAt);
  if(Number.isNaN(acceptedAt)||acceptedAt<Date.parse(offer.validFrom)||acceptedAt>Date.parse(offer.validUntil)) throw new Error('GOVERNED_BENCHMARK_COMMITMENT_OUTSIDE_OFFER_VALIDITY');
  const observedAt=Date.parse(benchmark.observedAt);
  if(Number.isNaN(observedAt)||observedAt>acceptedAt) throw new Error('GOVERNED_BENCHMARK_EVIDENCE_FUTURE');
  if(benchmark.specificationId!==commitment.obligation.specificationId) throw new Error('GOVERNED_BENCHMARK_SPECIFICATION_MISMATCH');
  const position=this.resolution.position({id:commitment.obligation.id,quantity:commitment.obligation.quantity});
  const completed=this.remedies?.completedRemediesFor(input.obligationId)??[];
  const replacements=completed.filter(x=>x.remedy.kind==='REPLACEMENT').reduce((n,x)=>n+x.completion.quantity.amount,0);
  const actualQuantity=normalizeAmount(position.performedQuantity.amount+replacements);
  const basisAmount=normalizeAmount(benchmark.basis.amount);
  if(position.performedQuantity.unit!==benchmark.basis.unit) throw new Error('GOVERNED_BENCHMARK_QUANTITY_MISMATCH');
  const comparableMinor=prorateMinor(benchmark.value.minor,actualQuantity,basisAmount);
  if(comparableMinor<=0n) throw new Error('GOVERNED_BENCHMARK_VALUATION_INVALID');
  const canonicalQuantity:Quantity=Object.freeze({amount:actualQuantity,unit:benchmark.basis.unit});
  const methodInput={id:input.benchmarkId,version:input.benchmarkVersion,purpose:'MEMBER_SAVINGS' as const,specificationId:benchmark.specificationId,quantity:canonicalQuantity,place:benchmark.place,serviceLevel:'pickup',transactionLevel:benchmark.transactionLevel,validFrom:offer.validFrom,validUntil:offer.validUntil,normalizationRuleVersion:benchmark.methodVersion,availabilityRuleVersion:'historical-committed-offer-v1',observationEvidenceIds:[benchmark.priceEvidenceId],definedAt:commitment.acceptedAt};
  const valuationInput={id:input.valuationId,benchmarkId:input.benchmarkId,benchmarkVersion:input.benchmarkVersion,obligationId:input.obligationId,specificationId:benchmark.specificationId,quantity:canonicalQuantity,place:benchmark.place,serviceLevel:'pickup',availability:'EXECUTABLE' as const,comparableValue:Object.freeze({minor:comparableMinor,currency:benchmark.value.currency}),evaluatedAt:commitment.acceptedAt,evidenceIds:[benchmark.priceEvidenceId]};
  const {method,valuation}=this.economics.recordBenchmarkPackage(methodInput,valuationInput);
  return Object.freeze({method,valuation,benchmark});
 }
 calculateSavings(input:{id:string;benchmarkValuationId:string;memberEconomicsId:string;calculatedAt:string;supersedes?:string}):SavingsEntry{
  return this.economics.calculateSavings(input);
 }
}

export interface MemberOrderOperationalView{
 readonly obligationId:string;
 readonly participantId:string;
 readonly specificationId:string;
 readonly committedQuantity:number;
 readonly unit:string;
 readonly performedQuantity:number;
 readonly remediedQuantity:number;
 readonly unresolvedQuantity:number;
 readonly latestSavingsMinor?:bigint;
 readonly savingsCurrency?:string;
 readonly savingsEntryId?:string;
 readonly sourceRecordIds:readonly string[];
}

type OrderPayload=
 |{kind:'ORDER_COMMITTED';obligationId:string;participantId:string;specificationId:string;quantity:number;unit:string}
 |{kind:'ORDER_RESOLUTION';obligationId:string;performedQuantity:number;remediedQuantity:number;unresolvedQuantity:number;unit:string}
 |{kind:'ORDER_SAVINGS';obligationId:string;entryId:string;minor:bigint;currency:string;supersedes?:string};

const lineage=(ids:readonly string[],next:string)=>Object.freeze([...ids,next]);
export const memberOrderProjection:ProjectionDefinition<MemberOrderOperationalView>={
 name:'member-order-history',
 key:(r:CanonicalProjectionRecord)=>{const p=r.payload as OrderPayload;return p.kind==='ORDER_COMMITTED'||p.kind==='ORDER_RESOLUTION'||p.kind==='ORDER_SAVINGS'?p.obligationId:undefined;},
 reduce:(current,r)=>{
  const p=r.payload as OrderPayload;
  if(p.kind==='ORDER_COMMITTED'){
   if(current) throw new Error('ORDER_PROJECTION_COMMITMENT_DUPLICATE');
   if(p.quantity<=0) throw new Error('ORDER_PROJECTION_QUANTITY_INVALID');
   return Object.freeze({obligationId:p.obligationId,participantId:p.participantId,specificationId:p.specificationId,committedQuantity:p.quantity,unit:p.unit,performedQuantity:0,remediedQuantity:0,unresolvedQuantity:p.quantity,sourceRecordIds:Object.freeze([r.recordId])});
  }
  if(!current) throw new Error('ORDER_PROJECTION_LINEAGE_MISSING');
  if(p.kind==='ORDER_RESOLUTION'){
   if(p.unit!==current.unit||p.performedQuantity<0||p.remediedQuantity<0||p.unresolvedQuantity<0||p.performedQuantity+p.remediedQuantity+p.unresolvedQuantity!==current.committedQuantity) throw new Error('ORDER_PROJECTION_RESOLUTION_INVALID');
   return Object.freeze({...current,performedQuantity:p.performedQuantity,remediedQuantity:p.remediedQuantity,unresolvedQuantity:p.unresolvedQuantity,sourceRecordIds:lineage(current.sourceRecordIds,r.recordId)});
  }
  if(current.savingsEntryId){if(p.supersedes!==current.savingsEntryId) throw new Error('ORDER_PROJECTION_SAVINGS_LINEAGE_INVALID');}
  else if(p.supersedes) throw new Error('ORDER_PROJECTION_SAVINGS_LINEAGE_INVALID');
  return Object.freeze({...current,latestSavingsMinor:p.minor,savingsCurrency:p.currency,savingsEntryId:p.entryId,sourceRecordIds:lineage(current.sourceRecordIds,r.recordId)});
 }
};
