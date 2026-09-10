import type {InMemoryDemandCommitmentLedger} from '../../demand/src/index.js';
import type {PilotCheckoutService} from '../../pilot-checkout/src/index.js';
import type {GovernedPilotRemedyService} from '../../pilot-remedies/src/index.js';
import type {GovernedMemberEconomicsService} from '../../pilot-member-economics/src/index.js';
import {memberOrderProjection} from '../../pilot-member-economics/src/index.js';
import {CanonicalRecordLog,RebuildableProjection} from '../../projections/src/index.js';

/**
 * Application-layer canonical order stream for the SW1 pilot.
 * Domain services remain authoritative for their own writes; this coordinator
 * records the application-level order lineage only after those governed writes
 * succeed. Read models rebuild exclusively from this stream.
 */
export class PilotOrderApplicationService {
 private readonly canonical=new CanonicalRecordLog();
 private sequence=0;
 constructor(
  private readonly checkoutService:PilotCheckoutService,
  private readonly remedyService:GovernedPilotRemedyService,
  private readonly economicsService:GovernedMemberEconomicsService,
  private readonly demand:Pick<InMemoryDemandCommitmentLedger,'getCommitment'>
 ){}
 private append(recordId:string,occurredAt:string,payload:unknown){
  return this.canonical.append({stream:'orders',sequence:++this.sequence,recordId,occurredAt,payload});
 }
 async checkout(input:Parameters<PilotCheckoutService['checkout']>[0]){
  const commitment=await this.checkoutService.checkout(input);
  this.append(`order:${String(commitment.obligation.id)}:committed`,commitment.acceptedAt,{kind:'ORDER_COMMITTED',obligationId:String(commitment.obligation.id),participantId:String(commitment.participantId),specificationId:String(commitment.obligation.specificationId),quantity:commitment.obligation.quantity.amount,unit:commitment.obligation.quantity.unit});
  return commitment;
 }
 completeRemedy(ctx:Parameters<GovernedPilotRemedyService['completeRemedy']>[0],input:Parameters<GovernedPilotRemedyService['completeRemedy']>[1]){
  const remedy=this.remedyService.getRemedy(input.remedyObligationId);
  if(!remedy) throw new Error('ORDER_STREAM_REMEDY_UNKNOWN');
  const completion=this.remedyService.completeRemedy(ctx,input);
  const commitment=this.demand.getCommitment(remedy.originalObligationId);
  if(!commitment) throw new Error('ORDER_STREAM_OBLIGATION_UNKNOWN');
  const position=this.remedyService.position(remedy.originalObligationId);
  this.append(`order:${String(remedy.originalObligationId)}:resolution:${completion.id}`,completion.completedAt,{kind:'ORDER_RESOLUTION',obligationId:String(remedy.originalObligationId),performedQuantity:position.performedQuantity.amount,remediedQuantity:position.remediedQuantity.amount,unresolvedQuantity:position.unresolvedQuantity.amount,unit:commitment.obligation.quantity.unit});
  return completion;
 }
 calculateSavings(input:Parameters<GovernedMemberEconomicsService['calculateSavings']>[0]){
  const savings=this.economicsService.calculateSavings(input);
  this.append(`order:${String(savings.obligationId)}:savings:${savings.id}`,savings.calculatedAt,{kind:'ORDER_SAVINGS',obligationId:String(savings.obligationId),entryId:savings.id,minor:savings.absoluteSavings.minor,currency:savings.absoluteSavings.currency,...(savings.supersedes?{supersedes:savings.supersedes}:{})});
  return savings;
 }
 canonicalRecords(){return this.canonical.all();}
 rebuildMemberOrderProjection(rebuiltAt:string){
  return new RebuildableProjection(memberOrderProjection).rebuild(this.canonical.all(),rebuiltAt);
 }
}
