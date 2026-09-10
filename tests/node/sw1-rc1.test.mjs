import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {FoundingWorkerEligibilityPolicy,GovernedEligibilityDecisionStore,InMemoryMembershipStore} from '../../dist/packages/membership/src/index.js';
import {InMemoryParticipantDirectory,InMemoryIdentityBindingStore,PilotIdentityMembershipService} from '../../dist/packages/identity/src/index.js';
import {InMemoryCatalog} from '../../dist/packages/catalog/src/index.js';
import {GovernedPilotCatalogService} from '../../dist/packages/pilot-catalog/src/index.js';
import {InMemoryPilotCartStore,PilotCheckoutService} from '../../dist/packages/pilot-checkout/src/index.js';
import {InMemoryDemandCommitmentLedger} from '../../dist/packages/demand/src/index.js';
import {SandboxPaymentProvider,SandboxWebhookVerifier,PilotPaymentService} from '../../dist/packages/pilot-payments/src/index.js';
import {ExplicitPhysicalLineageLedger} from '../../dist/packages/lineage/src/index.js';
import {InMemoryInventoryLedger} from '../../dist/packages/inventory/src/index.js';
import {GovernedPilotInventoryService} from '../../dist/packages/pilot-inventory/src/index.js';
import {InMemoryFulfillmentLedger} from '../../dist/packages/fulfillment/src/index.js';
import {InMemoryRemedyLedger} from '../../dist/packages/remedy/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {GovernedPilotFulfillmentService} from '../../dist/packages/pilot-fulfillment/src/index.js';
import {GovernedPilotRemedyService} from '../../dist/packages/pilot-remedies/src/index.js';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';
import {GovernedMemberEconomicsService} from '../../dist/packages/pilot-member-economics/src/index.js';

const id=x=>asId(x), pid=id, gid=id, eid=id, sid=id, oid=id, cid=id, lot=id;
const club=pid('participant:food-club');
const member=pid('participant:rc1-member');
const identityOperator=pid('participant:identity-operator');
const catalogOperator=pid('participant:catalog-operator');
const warehouse=pid('participant:warehouse-operator');
const finance=pid('participant:finance-operator');
const rice=sid('spec:rice:rc1');
const obligationId=oid('obligation:rc1-rice');
const offerId=oid('offer:rc1-rice');
const bulkLot=lot('lot:rc1-rice');
const t0='2026-09-10T08:00:00Z';

function build(){
  const authorityStore=new InMemoryAuthorityStore();
  const grants={
    identity:gid('grant:rc1-identity'), membership:gid('grant:rc1-membership'), catalog:gid('grant:rc1-catalog'),
    payment:gid('grant:rc1-payment'), inventory:gid('grant:rc1-inventory'), warehouse:gid('grant:rc1-warehouse'),
    memberFulfillment:gid('grant:rc1-member-fulfillment'), remedy:gid('grant:rc1-remedy')
  };
  authorityStore.put({id:grants.identity,grantorId:club,actorId:identityOperator,actions:['identity.bind'],targetPrefix:'participant:',validFrom:t0});
  authorityStore.put({id:grants.membership,grantorId:club,actorId:identityOperator,actions:['membership.verify'],targetPrefix:'membership:',validFrom:t0});
  authorityStore.put({id:grants.catalog,grantorId:club,actorId:catalogOperator,actions:['catalog.specification.publish','catalog.listing.publish','catalog.price.observe','catalog.sales-window.publish','catalog.benchmark.publish','catalog.offer.publish'],targetPrefix:'',validFrom:t0});
  authorityStore.put({id:grants.payment,grantorId:club,actorId:member,actions:['payment.initiate'],targetPrefix:'obligation:',validFrom:t0,maxQuantity:5});
  authorityStore.put({id:grants.inventory,grantorId:club,actorId:warehouse,actions:['inventory.receive','inventory.quality.assess','inventory.transform','inventory.receive-derived','inventory.allocate'],targetPrefix:'lot:',validFrom:t0,maxQuantity:10});
  authorityStore.put({id:grants.warehouse,grantorId:club,actorId:warehouse,actions:['fulfillment.pick','fulfillment.pack','fulfillment.ready','fulfillment.handover'],targetPrefix:'',validFrom:t0,maxQuantity:5});
  authorityStore.put({id:grants.memberFulfillment,grantorId:club,actorId:member,actions:['fulfillment.accept','fulfillment.exception'],targetPrefix:'',validFrom:t0,maxQuantity:5});
  authorityStore.put({id:grants.remedy,grantorId:club,actorId:finance,actions:['remedy.create','remedy.complete'],targetPrefix:'obligation:',validFrom:t0,maxQuantity:1});
  const authority=new AuthorityEvaluator(authorityStore);

  const participants=new InMemoryParticipantDirectory(); participants.register({id:member,kind:'PERSON'}); participants.register({id:identityOperator,kind:'PERSON'});
  const memberships=new InMemoryMembershipStore(); const bindings=new InMemoryIdentityBindingStore(); const eligibility=new GovernedEligibilityDecisionStore();
  const identity=new PilotIdentityMembershipService(participants,bindings,memberships,authority,eligibility);
  const catalog=new InMemoryCatalog(); let now='2026-09-10T08:10:00Z';
  const catalogService=new GovernedPilotCatalogService(authority,catalog,()=>now);
  const demand=new InMemoryDemandCommitmentLedger({isAccepted:async(_commandId,_eventId,expected)=>expected?.participantId===member&&expected?.action==='AcceptMemberPurchase'&&expected?.cartId==='cart:rc1'&&expected?.offerId===offerId&&expected?.quantity.amount===5&&expected?.quantity.unit==='kg'});
  const carts=new InMemoryPilotCartStore(); const checkout=new PilotCheckoutService(carts,demand,memberships,catalog);
  const provider=new SandboxPaymentProvider(); const verifier=new SandboxWebhookVerifier('rc1-secret'); const payments=new PilotPaymentService(provider,verifier,demand,authority);
  const inventoryLedger=new InMemoryInventoryLedger(); const inventory=new GovernedPilotInventoryService(authority,inventoryLedger,new ExplicitPhysicalLineageLedger(),demand);
  const resolution=new InMemoryObligationResolutionLedger(); const remediesLedger=new InMemoryRemedyLedger(resolution); const fulfillmentLedger=new InMemoryFulfillmentLedger(resolution);
  const fulfillment=new GovernedPilotFulfillmentService(authority,inventoryLedger,demand,fulfillmentLedger,remediesLedger);
  const remedies=new GovernedPilotRemedyService(authority,demand,remediesLedger,resolution);
  const economicsLedger=new InMemoryEconomicsLedger(); const economics=new GovernedMemberEconomicsService(demand,resolution,economicsLedger,remediesLedger);
  return {authorityStore,grants,identity,memberships,eligibility,catalog,catalogService,demand,carts,checkout,payments,inventory,inventoryLedger,resolution,remediesLedger,fulfillment,remedies,economics,economicsLedger,setNow:v=>{now=v;}};
}

async function runJourney(){
  const f=build();
  const principal={issuer:'https://auth.rc1.example',subject:'worker-001',authenticatedAt:'2026-09-10T08:01:00Z',providerEvidenceId:eid('evidence:rc1-auth'),assurance:'STANDARD'};
  assert.throws(()=>f.identity.resolveActiveMember(principal),/AUTH_IDENTITY_NOT_BOUND/);
  f.identity.bindAuthenticatedIdentity({bindingId:'binding:rc1',principal,participantId:member,actorId:identityOperator,grantIds:[f.grants.identity],at:'2026-09-10T08:02:00Z'});
  const decision=f.eligibility.record(new FoundingWorkerEligibilityPolicy(),{participantId:member,evidenceIds:[eid('evidence:rc1-employment')],at:'2026-09-10T08:03:00Z',attributes:{workerClass:'PUBLIC_SECTOR',verified:true}});
  f.identity.establishVerifiedMembership({membershipId:'membership:rc1',participantId:member,decision,actorId:identityOperator,grantIds:[f.grants.membership],at:'2026-09-10T08:04:00Z'});
  const active=f.identity.resolveActiveMember({...principal,authenticatedAt:'2026-09-10T08:05:00Z',providerEvidenceId:eid('evidence:rc1-auth-refresh')});

  const cctx={actorId:catalogOperator,grantIds:[f.grants.catalog],at:'2026-09-10T08:10:00Z'};
  f.catalogService.publishSpecification(cctx,{id:rice,version:1,name:'Rice',baseUnit:'kg'});
  f.catalogService.publishListing(cctx,{listingId:'listing:rc1-rice',sku:'RC1-RICE-5KG',specificationId:rice,displayName:'Rice 5 kg',active:true});
  const marketEvidence=eid('evidence:rc1-market');
  f.catalogService.recordPriceObservation(cctx,{evidenceId:marketEvidence,specificationId:rice,price:money(60000n,'GHS'),basis:quantity(5,'kg'),place:'Accra Retail',observedAt:'2026-09-10T08:06:00Z',transactionLevel:'RETAIL',conditions:['cash']},{sourceId:'market-survey:rc1',upstreamIdentity:'retailer:rc1'});
  f.catalogService.createSalesWindow(cctx,{id:'window:rc1',validFrom:'2026-09-10T08:00:00Z',validUntil:'2026-09-11T18:00:00Z',pickupPlace:'pickup:rc1',active:true,policyVersion:'sales-window-v1',createdBy:catalogOperator});
  f.catalogService.defineBenchmarkDisplay(cctx,{id:'benchmark-display:rc1',specificationId:rice,priceEvidenceId:marketEvidence,methodVersion:'retail-reference-v1'});
  const offer={id:offerId,offerorId:club,specificationId:rice,quantity:quantity(5,'kg'),memberPrice:money(50000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'pickup:rc1',validFrom:'2026-09-10T08:10:00Z',validUntil:'2026-09-11T12:00:00Z',priceEvidenceIds:[marketEvidence],policyVersions:['member-price-v1']};
  f.catalogService.publishOffer(cctx,{salesWindowId:'window:rc1',benchmarkDisplayId:'benchmark-display:rc1',offer});

  f.carts.create({id:'cart:rc1',participantId:member,at:'2026-09-10T08:15:00Z'});
  f.carts.setSingleLine({cartId:'cart:rc1',participantId:member,offer,quantity:quantity(5,'kg'),at:'2026-09-10T08:16:00Z'});
  const membership=f.memberships.get('membership:rc1');
  const commitment=await f.checkout.checkout({cartId:'cart:rc1',participantId:member,membership,offer,obligationId,authorizedCommandId:cid('command:rc1-checkout'),authorizedEventId:'event:rc1-checkout',acceptedAt:'2026-09-10T08:17:00Z',policyVersions:['checkout-v1']});
  assert.equal(commitment.obligation.quantity.amount,5);

  const intent=f.payments.createIntent({actorId:member,grantIds:[f.grants.payment],at:'2026-09-10T08:18:00Z'},{obligationId,participantId:member,offer,idempotencyKey:'rc1-payment'});
  const paymentBody=JSON.stringify({providerReference:intent.providerReference,status:'CONFIRMED',amountMinor:'50000',currency:'GHS',occurredAt:'2026-09-10T08:19:00Z'});
  const receipt=f.payments.reconcileWebhook({eventId:'event:rc1-payment',rawBody:paymentBody,signature:`sandbox:rc1-secret:${paymentBody}`,receivedAt:'2026-09-10T08:20:00Z'});
  const redelivery=f.payments.reconcileWebhook({eventId:'event:rc1-payment-redelivery',rawBody:paymentBody,signature:`sandbox:rc1-secret:${paymentBody}`,receivedAt:'2026-09-10T08:21:00Z'});
  assert.equal(redelivery.evidenceId,receipt.evidenceId); assert.equal(f.demand.paymentsFor(obligationId).length,1);

  const ictx={actorId:warehouse,grantIds:[f.grants.inventory],at:'2026-09-10T08:30:00Z'};
  f.inventory.receiveLot(ictx,{lot:{id:bulkLot,specificationId:rice,quantity:quantity(5,'kg')},ownerId:club,custodianId:warehouse,placeId:'warehouse:rc1',receivedAt:'2026-09-10T08:25:00Z',receiptEvidenceIds:[eid('evidence:rc1-receipt')]});
  f.inventory.assessQuality(ictx,{id:'quality:rc1',lotId:bulkLot,state:'ACCEPTED',assessedAt:'2026-09-10T08:26:00Z',evidenceIds:[eid('evidence:rc1-quality')]});
  f.inventory.allocate(ictx,{allocation:{id:'allocation:rc1',lotId:bulkLot,obligationId,specificationId:rice,quantity:quantity(5,'kg'),allocatedAt:'2026-09-10T08:27:00Z',evidenceIds:[eid('evidence:rc1-allocation')]}});
  assert.equal(f.inventory.availability(bulkLot).amount,0);
  assert.throws(()=>f.inventory.transform(ictx,{id:'transform:rc1-forbidden',kind:'REPACK',inputs:[{lotId:String(bulkLot),quantity:quantity(1,'kg')}],outputs:[{lotId:'lot:rc1-illegal-derived',quantity:quantity(1,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:'2026-09-10T08:28:00Z',evidenceIds:[eid('evidence:rc1-transform-attempt')]}),/TRANSFORMATION_INPUT_EXCEEDS_AVAILABLE/);

  const wctx={actorId:warehouse,grantIds:[f.grants.warehouse],at:'2026-09-10T08:40:00Z'};
  const work=(state,workId,supersedes)=>({id:workId,allocationId:'allocation:rc1',lotId:bulkLot,obligationId,specificationId:rice,quantity:quantity(5,'kg'),state,operatorId:warehouse,placeId:'pickup:rc1',occurredAt:'2026-09-10T08:35:00Z',evidenceIds:[eid(`evidence:${workId}`)],...(supersedes?{supersedes}:{})});
  f.fulfillment.recordWork(wctx,work('PICKED','pick:rc1'));
  f.fulfillment.recordWork(wctx,work('PACKED','pack:rc1','pick:rc1'));
  f.fulfillment.recordWork(wctx,work('READY_FOR_PICKUP','ready:rc1','pack:rc1'));
  f.fulfillment.handover(wctx,{id:'handover:rc1',fulfillmentWorkId:'ready:rc1',obligationId,fromCustodianId:warehouse,toParticipantId:member,placeId:'pickup:rc1',handedOverAt:'2026-09-10T08:36:00Z',evidenceIds:[eid('evidence:rc1-handover')]});
  assert.equal(f.fulfillment.performance(obligationId).state,'OPEN');
  const mctx={actorId:member,grantIds:[f.grants.memberFulfillment],at:'2026-09-10T08:41:00Z'};
  f.fulfillment.accept(mctx,{id:'acceptance:rc1',handoverId:'handover:rc1',obligationId,participantId:member,state:'PARTIALLY_ACCEPTED',quantity:quantity(4,'kg'),acceptedAt:'2026-09-10T08:37:00Z',evidenceIds:[eid('evidence:rc1-acceptance')]});
  f.fulfillment.recordException(mctx,{id:'exception:rc1-shortfall',obligationId,participantId:member,kind:'SHORTFALL',affectedQuantity:quantity(1,'kg'),occurredAt:'2026-09-10T08:38:00Z',evidenceIds:[eid('evidence:rc1-shortfall')],relatedAcceptanceId:'acceptance:rc1'});
  assert.equal(f.resolution.position(commitment.obligation).performedQuantity.amount,4); assert.equal(f.remediesLedger.getRemedy('remedy:rc1-refund'),undefined);

  const rctx={actorId:finance,grantIds:[f.grants.remedy],at:'2026-09-10T08:45:00Z'};
  f.remedies.createRemedy(rctx,{id:'remedy:rc1-refund',sourceExceptionId:'exception:rc1-shortfall',originalObligationId:obligationId,participantId:member,kind:'REFUND',quantity:quantity(1,'kg'),createdAt:'2026-09-10T08:42:00Z',authorizedEventId:'event:rc1-refund-authorized',evidenceIds:[eid('evidence:rc1-refund-auth')],economicClassification:'REMEDY_SETTLEMENT'});
  f.remedies.completeRemedy(rctx,{id:'completion:rc1-refund',remedyObligationId:'remedy:rc1-refund',quantity:quantity(1,'kg'),completedAt:'2026-09-10T08:43:00Z',evidenceIds:[eid('evidence:rc1-refund-settled')],settlementAmount:money(10000n,'GHS')});
  const position=f.resolution.position(commitment.obligation); assert.equal(position.performedQuantity.amount,4); assert.equal(position.remediedQuantity.amount,1); assert.equal(position.unresolvedQuantity.amount,0);

  f.economicsLedger.defineBenchmark({id:'benchmark:rc1',version:1,purpose:'MEMBER_SAVINGS',specificationId:rice,quantity:quantity(4,'kg'),place:'Accra',serviceLevel:'pickup',transactionLevel:'RETAIL',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',normalizationRuleVersion:'norm:v1',availabilityRuleVersion:'availability:v1',observationEvidenceIds:[marketEvidence],definedAt:'2026-09-10T08:10:00Z'});
  f.economicsLedger.recordBenchmarkValuation({id:'valuation:rc1',benchmarkId:'benchmark:rc1',benchmarkVersion:1,obligationId,specificationId:rice,quantity:quantity(4,'kg'),place:'Accra',serviceLevel:'pickup',availability:'EXECUTABLE',comparableValue:money(48000n,'GHS'),evaluatedAt:'2026-09-10T08:50:00Z',evidenceIds:[marketEvidence]});
  f.economics.recordFulfilledEconomics({id:'member-econ:rc1',obligationId,participantId:member,specificationId:rice,quantity:quantity(4,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(50000n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(10000n,'GHS'),economicEvidenceIds:[receipt.evidenceId,eid('evidence:rc1-refund-settled')],realizedAt:'2026-09-10T08:51:00Z',substitutionEvidenceIds:[]});
  const savings=f.economics.calculateSavings({id:'savings:rc1',benchmarkValuationId:'valuation:rc1',memberEconomicsId:'member-econ:rc1',calculatedAt:'2026-09-10T08:52:00Z'});
  assert.equal(savings.absoluteSavings.minor,8000n);
  return {f,active,commitment,receipt,position,savings};
}

test('SW1-RC1 integrated replay preserves the mandatory 5kg -> 4kg performance + 1kg refund conservation path',async()=>{
  const {active,commitment,receipt,position,savings}=await runJourney();
  assert.equal(active.participant.id,member); assert.equal(commitment.obligation.id,obligationId); assert.equal(receipt.economicTreatment,'RESTRICTED_MEMBER_PREPAYMENT');
  assert.equal(position.performedQuantity.amount,4); assert.equal(position.remediedQuantity.amount,1); assert.equal(position.unresolvedQuantity.amount,0); assert.equal(savings.absoluteSavings.minor,8000n);
});

test('SW1-RC1 integrated state rejects forged payment and economics mutation attempts',async()=>{
  const {f,receipt}=await runJourney();
  const intent=f.payments.createIntent({actorId:member,grantIds:[f.grants.payment],at:'2026-09-10T09:00:00Z'},{obligationId,participantId:member,offer:f.catalog.getOffer(offerId),idempotencyKey:'rc1-payment'});
  const tampered=JSON.stringify({providerReference:intent.providerReference,status:'CONFIRMED',amountMinor:'1',currency:'GHS',occurredAt:'2026-09-10T09:01:00Z'});
  assert.throws(()=>f.payments.reconcileWebhook({eventId:'event:rc1-tampered',rawBody:tampered,signature:`sandbox:rc1-secret:${tampered}`,receivedAt:'2026-09-10T09:02:00Z'}),/PAYMENT_AMOUNT_MISMATCH/);
  assert.throws(()=>f.economics.recordFulfilledEconomics({id:'member-econ:rc1-forged',obligationId,participantId:member,specificationId:rice,quantity:quantity(5,'kg'),place:'Accra',serviceLevel:'pickup',goodsOutlay:money(1n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(10000n,'GHS'),economicEvidenceIds:[receipt.evidenceId,eid('evidence:rc1-refund-settled')],realizedAt:'2026-09-10T09:03:00Z',substitutionEvidenceIds:[]}),/MEMBER_ECONOMICS_NOT_ACTUAL_PERFORMANCE|MEMBER_ECONOMICS_OUTLAY_NOT_CANONICAL/);
});