import type {EvidenceId,Money,ObligationId,ParticipantId,Quantity,SpecificationId} from '../../kernel/src/index.js';
import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';
import {InMemoryEconomicsLedger,type FulfilledMemberEconomics,type SavingsEntry} from '../../economics/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../resolution/src/index.js';
import type {InMemoryRemedyLedger} from '../../remedy/src/index.js';
import type {CanonicalProjectionRecord,ProjectionDefinition} from '../../projections/src/index.js';
import type {GovernedPilotCatalogService} from '../../pilot-catalog/src/index.js';

const sameQuantity=(a:Quantity,b:Quantity)=>a.unit===b.unit&&a.amount===b.amount;
const sameMoney=(a:Money,b:Money)=>a.currency===b.currency&&a.minor===b.minor;
const validTime=(v:string)=>!Number.isNaN(Date.parse(v));
const sameEvidence=(actual:readonly EvidenceId[],expected:readonly EvidenceId[])=>actual.length===expected.length&&new Set(actual.map(String)).size===actual.length&&actual.every(id=>expected.some(x=>String(x)===String(id)));

export class GovernedMemberEconomicsService{
 constructor(
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'|'paymentsFor'>,
  private readonly resolution:InMemoryObligationResolutionLedger,
  private readonly economics:InMemoryEconomicsLedger,
  private readonly remedies?:Pick<InMemoryRemedyLedger,'completedRemediesFor'>,
  private readonly catalog?:Pick<GovernedPilotCatalogService,'catalogView'>
 ){}
 recordFulfilledEconomics(input:FulfilledMemberEconomics){
  const commitment=this.demand.getCommitment(input.obligationId);
  if(!commitment) throw new Error('MEMBER_ECONOMICS_OBLIGATION_UNKNOWN');
  if(input.participantId!==commitment.participantId) throw new Error('MEMBER_ECONOMICS_PARTICIPANT_MISMATCH');
  if(input.specificationId!==commitment.obligation.specificationId) throw new Error('MEMBER_ECONOMICS_SPECIFICATION_MISMATCH');
  const position=this.resolution.position({id:commitment.obligation.id,quantity:commitment.obligation.quantity});
  const completed=this.remedies?.completedRemediesFor(input.obligationId)??[];
  const replacements=completed.filter(x=>x.remedy.kind==='REPLACEMENT').reduce((n,x)=>n+x.completion.quantity.amount,0);
  const fulfilledQuantity:Object=Object.freeze({amount:position.performedQuantity.amount+replacements,unit:position.performedQuantity.unit});
  if(!sameQuantity(input.quantity,fulfilledQuantity as Quantity)||input.quantity.amount<=0) throw new Error('MEMBER_ECONOMICS_NOT_ACTUAL_PERFORMANCE');

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
  return this.economics.recordFulfilledMemberEconomics(input);
 }
 recordGovernedSavingsBenchmark(input:{benchmarkId:string;benchmarkVersion:number;valuationId:string;obligationId:ObligationId;listingId:string;offerId:any;benchmarkDisplayId:string;catalogAt:string;serviceLevel:string;validFrom:string;validUntil:string;availabilityRuleVersion:string;evaluatedAt:string}){
  if(!this.catalog) throw new Error('GOVERNED_BENCHMARK_CATALOG_REQUIRED');
  const commitment=this.demand.getCommitment(input.obligationId);
  if(!commitment) throw new Error('GOVERNED_BENCHMARK_OBLIGATION_UNKNOWN');
  if(commitment.offerId!==input.offerId) throw new Error('GOVERNED_BENCHMARK_OFFER_MISMATCH');
  const view=this.catalog.catalogView({listingId:input.listingId,offerId:input.offerId,benchmarkDisplayId:input.benchmarkDisplayId,at:input.catalogAt});
  const benchmark=view.benchmark;
  if(benchmark.specificationId!==commitment.obligation.specificationId) throw new Error('GOVERNED_BENCHMARK_SPECIFICATION_MISMATCH');
  const position=this.resolution.position({id:commitment.obligation.id,quantity:commitment.obligation.quantity});
  const completed=this.remedies?.completedRemediesFor(input.obligationId)??[];
  const replacements=completed.filter(x=>x.remedy.kind==='REPLACEMENT').reduce((n,x)=>n+x.completion.quantity.amount,0);
  const actualQuantity=position.performedQuantity.amount+replacements;
  if(actualQuantity<=0||position.performedQuantity.unit!==benchmark.basis.unit||benchmark.basis.amount<=0) throw new Error('GOVERNED_BENCHMARK_QUANTITY_MISMATCH');
  const comparableMinor=benchmark.value.minor*BigInt(actualQuantity)/BigInt(benchmark.basis.amount);
  if(comparableMinor<=0n) throw new Error('GOVERNED_BENCHMARK_VALUATION_INVALID');
  const quantity:Object=Object.freeze({amount:actualQuantity,unit:benchmark.basis.unit});
  const method=this.economics.defineBenchmark({id:input.benchmarkId,version:input.benchmarkVersion,purpose:'MEMBER_SAVINGS',specificationId:benchmark.specificationId,quantity:quantity as Quantity,place:benchmark.place,serviceLevel:input.serviceLevel,transactionLevel:benchmark.transactionLevel,validFrom:input.validFrom,validUntil:input.validUntil,normalizationRuleVersion:benchmark.methodVersion,availabilityRuleVersion:input.availabilityRuleVersion,observationEvidenceIds:[benchmark.priceEvidenceId],definedAt:input.catalogAt});
  const valuation=this.economics.recordBenchmarkValuation({id:input.valuationId,benchmarkId:method.id,benchmarkVersion:method.version,obligationId:input.obligationId,specificationId:benchmark.specificationId,quantity:quantity as Quantity,place:benchmark.place,serviceLevel:input.serviceLevel,availability:'EXECUTABLE',comparableValue:Object.freeze({minor:comparableMinor,currency:benchmark.value.currency}),evaluatedAt:input.evaluatedAt,evidenceIds:[benchmark.priceEvidenceId]});
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
