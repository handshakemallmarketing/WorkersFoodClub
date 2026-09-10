import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';
import type {PilotCheckoutService} from '../../pilot-checkout/src/index.js';
import type {GovernedPilotFulfillmentService} from '../../pilot-fulfillment/src/index.js';
import type {GovernedPilotRemedyService} from '../../pilot-remedies/src/index.js';
import type {GovernedMemberEconomicsService} from '../../pilot-member-economics/src/index.js';
import {memberOrderProjection} from '../../pilot-member-economics/src/index.js';
import {CanonicalRecordLog,RebuildableProjection} from '../../projections/src/index.js';

const canonicalRecordId=(...parts:string[])=>parts.map(part=>`${part.length}:${part}`).join('|');

/**
 * Application-layer canonical order stream for the SW1 pilot.
 * Domain services remain authoritative for their own writes; this coordinator
 * records application-level order lineage only after governed writes succeed.
 * Read models rebuild exclusively from this stream.
 */
export class PilotOrderApplicationService {
 private readonly canonical=new CanonicalRecordLog();
 private sequence=0;
 constructor(
  private readonly checkoutService:PilotCheckoutService,
  private readonly fulfillmentService:GovernedPilotFulfillmentService,
  private readonly remedyService:GovernedPilotRemedyService,
  private readonly economicsService:GovernedMemberEconomicsService,
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'>
 ){
  const resolution=this.fulfillmentService.resolutionLedger();
  if(resolution!==this.remedyService.resolutionLedger()||resolution!==this.economicsService.resolutionLedger()) throw new Error('ORDER_STREAM_RESOLUTION_LEDGER_MISMATCH');
  const canonicalDemand=this.checkoutService.demandLedger();
  if(canonicalDemand!==this.demand||canonicalDemand!==this.fulfillmentService.demandLedger()||canonicalDemand!==this.remedyService.demandLedger()||canonicalDemand!==this.economicsService.demandLedger()) throw new Error('ORDER_STREAM_DEMAND_LEDGER_MISMATCH');
  const canonicalCatalog=this.checkoutService.catalogStore();
  if(canonicalCatalog!==this.economicsService.catalogStore()) throw new Error('ORDER_STREAM_CATALOG_STORE_MISMATCH');
 }
 private append(recordId:string,occurredAt:string,payload:unknown){
  return this.canonical.append({stream:'orders',sequence:++this.sequence,recordId,occurredAt,payload});
 }
 private appendResolution(obligationId:Parameters<GovernedPilotFulfillmentService['performance']>[0],effectType:'acceptance'|'remedy',recordSuffix:string,occurredAt:string){
  const commitment=this.demand.getCommitment(obligationId);
  if(!commitment) throw new Error('ORDER_STREAM_OBLIGATION_UNKNOWN');
  const position=this.remedyService.position(obligationId);
  this.append(canonicalRecordId('order',String(obligationId),'resolution',effectType,recordSuffix),occurredAt,{kind:'ORDER_RESOLUTION',obligationId:String(obligationId),performedQuantity:position.performedQuantity.amount,remediedQuantity:position.remediedQuantity.amount,unresolvedQuantity:position.unresolvedQuantity.amount,unit:commitment.obligation.quantity.unit});
 }
 async checkout(input:Parameters<PilotCheckoutService['checkout']>[0]){
  const commitment=await this.checkoutService.checkout(input);
  this.append(canonicalRecordId('order',String(commitment.obligation.id),'committed'),commitment.acceptedAt,{kind:'ORDER_COMMITTED',obligationId:String(commitment.obligation.id),participantId:String(commitment.participantId),specificationId:String(commitment.obligation.specificationId),quantity:commitment.obligation.quantity.amount,unit:commitment.obligation.quantity.unit});
  return commitment;
 }
 accept(ctx:Parameters<GovernedPilotFulfillmentService['accept']>[0],input:Parameters<GovernedPilotFulfillmentService['accept']>[1]){
  const acceptance=this.fulfillmentService.accept(ctx,input);
  this.appendResolution(input.obligationId,'acceptance',acceptance.id,acceptance.acceptedAt);
  return acceptance;
 }
 completeRemedy(ctx:Parameters<GovernedPilotRemedyService['completeRemedy']>[0],input:Parameters<GovernedPilotRemedyService['completeRemedy']>[1]){
  const remedy=this.remedyService.getRemedy(input.remedyObligationId);
  if(!remedy) throw new Error('ORDER_STREAM_REMEDY_UNKNOWN');
  const completion=this.remedyService.completeRemedy(ctx,input);
  this.appendResolution(remedy.originalObligationId,'remedy',completion.id,completion.completedAt);
  return completion;
 }
 calculateSavings(input:Parameters<GovernedMemberEconomicsService['calculateSavings']>[0]){
  const savings=this.economicsService.calculateSavings(input);
  this.append(canonicalRecordId('order',String(savings.obligationId),'savings',savings.id),savings.calculatedAt,{kind:'ORDER_SAVINGS',obligationId:String(savings.obligationId),entryId:savings.id,minor:savings.absoluteSavings.minor,currency:savings.absoluteSavings.currency,...(savings.supersedes?{supersedes:savings.supersedes}:{})});
  return savings;
 }
 canonicalRecords(){return this.canonical.all();}
 rebuildMemberOrderProjection(rebuiltAt:string){
  return new RebuildableProjection(memberOrderProjection).rebuild(this.canonical.all(),rebuiltAt);
 }
}
