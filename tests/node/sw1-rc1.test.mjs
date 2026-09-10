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
import {snapshotDigest,assertFresh} from '../../dist/packages/projections/src/index.js';
import {GovernedMemberEconomicsService} from '../../dist/packages/pilot-member-economics/src/index.js';
import {PilotOrderApplicationService} from '../../dist/packages/application/src/pilot-order.js';
import {GovernedPilotOperationsService} from '../../dist/packages/pilot-operations/src/index.js';

const id=x=>asId(x),pid=id,gid=id,eid=id,sid=id,oid=id,cid=id,lot=id;
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
 const grants={identity:gid('grant:rc1-identity'),membership:gid('grant:rc1-membership'),catalog:gid('grant:rc1-catalog'),payment:gid('grant:rc1-payment'),inventory:gid('grant:rc1-inventory'),warehouse:gid('grant:rc1-warehouse'),memberFulfillment:gid('grant:rc1-member-fulfillment'),memberOverclaim:gid('grant:rc1-member-overclaim-probe'),remedy:gid('grant:rc1-remedy'),adminMutation:gid('grant:rc1-admin-mutation'),recovery:gid('grant:rc1-recovery')};
 authorityStore.put({id:grants.identity,grantorId:club,actorId:identityOperator,actions:['identity.bind'],targetPrefix:'participant:',validFrom:t0});
 authorityStore.put({id:grants.membership,grantorId:club,actorId:identityOperator,actions:['membership.verify'],targetPrefix:'membership:',validFrom:t0});
 authorityStore.put({id:grants.catalog,grantorId:club,actorId:catalogOperator,actions:['catalog.specification.publish','catalog.listing.publish','catalog.price.observe','catalog.sales-window.publish','catalog.benchmark.publish','catalog.offer.publish'],targetPrefix:'',validFrom:t0});
 authorityStore.put({id:grants.payment,grantorId:club,actorId:member,actions:['payment.initiate'],targetPrefix:'obligation:',validFrom:t0,maxQuantity:5});
 authorityStore.put({id:grants.inventory,grantorId:club,actorId:warehouse,actions:['inventory.receive','inventory.quality.assess','inventory.transform','inventory.receive-derived','inventory.allocate'],targetPrefix:'lot:',validFrom:t0,maxQuantity:10});
 authorityStore.put({id:grants.warehouse,grantorId:club,actorId:warehouse,actions:['fulfillment.pick','fulfillment.pack','fulfillment.ready','fulfillment.handover'],targetPrefix:'',validFrom:t0,maxQuantity:5});
 authorityStore.put({id:grants.memberFulfillment,grantorId:club,actorId:member,actions:['fulfillment.accept','fulfillment.exception'],targetPrefix:'',validFrom:t0,maxQuantity:5});
 authorityStore.put({id:grants.memberOverclaim,grantorId:club,actorId:member,actions:['fulfillment.accept'],targetPrefix:'obligation:',validFrom:t0,maxQuantity:10});
 authorityStore.put({id:grants.remedy,grantorId:club,actorId:finance,actions:['remedy.create','remedy.complete'],targetPrefix:'obligation:',validFrom:t0,maxQuantity:1});
 authorityStore.put({id:grants.adminMutation,grantorId:club,actorId:finance,actions:['admin.obligation.annotate'],targetPrefix:'obligation:',validFrom:t0});
 authorityStore.put({id:grants.recovery,grantorId:club,actorId:finance,actions:['admin.recovery.reconcile'],targetPrefix:'obligation:',validFrom:t0});
 const authority=new AuthorityEvaluator(authorityStore);
 const participants=new InMemoryParticipantDirectory();participants.register({id:member,kind:'PERSON'});participants.register({id:identityOperator,kind:'PERSON'});
 const memberships=new InMemoryMembershipStore(),bindings=new InMemoryIdentityBindingStore(),eligibility=new GovernedEligibilityDecisionStore();
 const identity=new PilotIdentityMembershipService(participants,bindings,memberships,authority,eligibility);
 const catalog=new InMemoryCatalog();let now='2026-09-10T08:10:00Z';const catalogService=new GovernedPilotCatalogService(authority,catalog,()=>now);
 const demand=new InMemoryDemandCommitmentLedger({isAccepted:async(_commandId,_eventId,expected)=>expected?.participantId===member&&expected?.action==='AcceptMemberPurchase'&&expected?.cartId==='cart:rc1'&&expected?.offerId===offerId&&expected?.quantity.amount===5&&expected?.quantity.unit==='kg'});
 const carts=new InMemoryPilotCartStore(),checkout=new PilotCheckoutService(carts,demand,memberships,catalog);
 const provider=new SandboxPaymentProvider(),verifier=new SandboxWebhookVerifier('rc1-secret'),payments=new PilotPaymentService(provider,verifier,demand,authority);
 const inventoryLedger=new InMemoryInventoryLedger(),inventory=new GovernedPilotInventoryService(authority,inventoryLedger,new ExplicitPhysicalLineageLedger(),demand);
 const resolution=new InMemoryObligationResolutionLedger(),remediesLedger=new InMemoryRemedyLedger(resolution),fulfillmentLedger=new InMemoryFulfillmentLedger(resolution);
 const fulfillment=new GovernedPilotFulfillmentService(authority,inventoryLedger,demand,fulfillmentLedger,remediesLedger);
 const remedies=new GovernedPilotRemedyService(authority,demand,remediesLedger,resolution);
 const economicsLedger=new InMemoryEconomicsLedger(),economics=new GovernedMemberEconomicsService(demand,resolution,economicsLedger,remediesLedger,catalogService);
 const app=new PilotOrderApplicationService(checkout,fulfillment,remedies,economics,demand);
 return {authorityStore,authority,grants,identity,memberships,eligibility,catalog,catalogService,demand,carts,checkout,payments,inventory,inventoryLedger,resolution,remediesLedger,fulfillment,remedies,economics,economicsLedger,app,setNow:v=>{now=v;}};
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
 const benchmarkDisplay=f.catalogService.defineBenchmarkDisplay(cctx,{id:'benchmark-display:rc1',specificationId:rice,priceEvidenceId:marketEvidence,methodVersion:'retail-reference-v1'});
 const offer={id:offerId,offerorId:club,specificationId:rice,quantity:quantity(5,'kg'),memberPrice:money(50000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'pickup:rc1',validFrom:'2026-09-10T08:10:00Z',validUntil:'2026-09-11T12:00:00Z',priceEvidenceIds:[marketEvidence],policyVersions:['member-price-v1']};
 f.catalogService.publishOffer(cctx,{salesWindowId:'window:rc1',benchmarkDisplayId:'benchmark-display:rc1',offer});

 f.carts.create({id:'cart:rc1',participantId:member,at:'2026-09-10T08:15:00Z'});f.carts.setSingleLine({cartId:'cart:rc1',participantId:member,offer,quantity:quantity(5,'kg'),at:'2026-09-10T08:16:00Z'});
 const membership=f.memberships.get('membership:rc1');
 const commitment=await f.app.checkout({cartId:'cart:rc1',participantId:member,membership,offer,obligationId,authorizedCommandId:cid('command:rc1-checkout'),authorizedEventId:'event:rc1-checkout',acceptedAt:'2026-09-10T08:17:00Z',policyVersions:['checkout-v1']});
 assert.equal(commitment.obligation.quantity.amount,5);

 const intent=f.payments.createIntent({actorId:member,grantIds:[f.grants.payment],at:'2026-09-10T08:18:00Z'},{obligationId,participantId:member,offer,idempotencyKey:'rc1-payment'});
 const paymentBody=JSON.stringify({providerReference:intent.providerReference,status:'CONFIRMED',amountMinor:'50000',currency:'GHS',occurredAt:'2026-09-10T08:19:00Z'});
 const receipt=f.payments.reconcileWebhook({eventId:'event:rc1-payment',rawBody:paymentBody,signature:`sandbox:rc1-secret:${paymentBody}`,receivedAt:'2026-09-10T08:20:00Z'});
 const sameEventReplay=f.payments.reconcileWebhook({eventId:'event:rc1-payment',rawBody:paymentBody,signature:`sandbox:rc1-secret:${paymentBody}`,receivedAt:'2026-09-10T08:20:30Z'});
 const redelivery=f.payments.reconcileWebhook({eventId:'event:rc1-payment-redelivery',rawBody:paymentBody,signature:`sandbox:rc1-secret:${paymentBody}`,receivedAt:'2026-09-10T08:21:00Z'});
 assert.equal(sameEventReplay.evidenceId,receipt.evidenceId);assert.equal(redelivery.evidenceId,receipt.evidenceId);assert.equal(f.demand.paymentsFor(obligationId).length,1);

 const ictx={actorId:warehouse,grantIds:[f.grants.inventory],at:'2026-09-10T08:30:00Z'};
 f.inventory.receiveLot(ictx,{lot:{id:bulkLot,specificationId:rice,quantity:quantity(5,'kg')},ownerId:club,custodianId:warehouse,placeId:'warehouse:rc1',receivedAt:'2026-09-10T08:25:00Z',receiptEvidenceIds:[eid('evidence:rc1-receipt')]});
 f.inventory.assessQuality(ictx,{id:'quality:rc1',lotId:bulkLot,state:'ACCEPTED',assessedAt:'2026-09-10T08:26:00Z',evidenceIds:[eid('evidence:rc1-quality')]});
 f.inventory.allocate(ictx,{allocation:{id:'allocation:rc1',lotId:bulkLot,obligationId,specificationId:rice,quantity:quantity(5,'kg'),allocatedAt:'2026-09-10T08:27:00Z',evidenceIds:[eid('evidence:rc1-allocation')]}});
 assert.equal(f.inventory.availability(bulkLot).amount,0);
 assert.throws(()=>f.inventory.transform(ictx,{id:'transform:rc1-forbidden',kind:'REPACK',inputs:[{lotId:String(bulkLot),quantity:quantity(1,'kg')}],outputs:[{lotId:'lot:rc1-illegal-derived',quantity:quantity(1,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:'2026-09-10T08:28:00Z',evidenceIds:[eid('evidence:rc1-transform-attempt')]}),/TRANSFORMATION_INPUT_EXCEEDS_AVAILABLE/);
 assert.throws(()=>f.inventory.allocate(ictx,{allocation:{id:'allocation:rc1-double',lotId:bulkLot,obligationId,specificationId:rice,quantity:quantity(1,'kg'),allocatedAt:'2026-09-10T08:28:30Z',evidenceIds:[eid('evidence:rc1-double-allocation')]}}),/LOT_OVERALLOCATION/);

 const wctx={actorId:warehouse,grantIds:[f.grants.warehouse],at:'2026-09-10T08:40:00Z'};
 const work=(state,workId,supersedes)=>({id:workId,allocationId:'allocation:rc1',lotId:bulkLot,obligationId,specificationId:rice,quantity:quantity(5,'kg'),state,operatorId:warehouse,placeId:'pickup:rc1',occurredAt:'2026-09-10T08:35:00Z',evidenceIds:[eid(`evidence:${workId}`)],...(supersedes?{supersedes}:{})});
 f.fulfillment.recordWork(wctx,work('PICKED','pick:rc1'));f.fulfillment.recordWork(wctx,work('PACKED','pack:rc1','pick:rc1'));f.fulfillment.recordWork(wctx,work('READY_FOR_PICKUP','ready:rc1','pack:rc1'));
 f.fulfillment.handover(wctx,{id:'handover:rc1',fulfillmentWorkId:'ready:rc1',obligationId,fromCustodianId:warehouse,toParticipantId:member,placeId:'pickup:rc1',handedOverAt:'2026-09-10T08:36:00Z',evidenceIds:[eid('evidence:rc1-handover')]});
 assert.equal(f.fulfillment.performance(obligationId).state,'OPEN');
 const overclaimCtx={actorId:member,grantIds:[f.grants.memberOverclaim],at:'2026-09-10T08:41:00Z'};
 assert.throws(()=>f.app.accept(overclaimCtx,{id:'acceptance:rc1-overclaim-probe',handoverId:'handover:rc1',obligationId,participantId:member,state:'ACCEPTED',quantity:quantity(6,'kg'),acceptedAt:'2026-09-10T08:36:30Z',evidenceIds:[eid('evidence:rc1-acceptance-overclaim')]}),/ACCEPTANCE_QUANTITY_INVALID/);
 const mctx={actorId:member,grantIds:[f.grants.memberFulfillment],at:'2026-09-10T08:41:00Z'};
 f.app.accept(mctx,{id:'acceptance:rc1',handoverId:'handover:rc1',obligationId,participantId:member,state:'PARTIALLY_ACCEPTED',quantity:quantity(4,'kg'),acceptedAt:'2026-09-10T08:37:00Z',evidenceIds:[eid('evidence:rc1-acceptance')]});
 const preRemedySnapshot=f.app.rebuildMemberOrderProjection('2026-09-10T08:37:30Z');
 const preRemedyView=preRemedySnapshot.rows.get(String(obligationId));assert.equal(preRemedyView.performedQuantity,4);assert.equal(preRemedyView.remediedQuantity,0);assert.equal(preRemedyView.unresolvedQuantity,1);
 f.fulfillment.recordException(mctx,{id:'exception:rc1-shortfall',obligationId,participantId:member,kind:'SHORTFALL',affectedQuantity:quantity(1,'kg'),occurredAt:'2026-09-10T08:38:00Z',evidenceIds:[eid('evidence:rc1-shortfall')],relatedAcceptanceId:'acceptance:rc1'});
 assert.equal(f.resolution.position(commitment.obligation).performedQuantity.amount,4);assert.equal(f.remediesLedger.getRemedy('remedy:rc1-refund'),undefined);

 const rctx={actorId:finance,grantIds:[f.grants.remedy],at:'2026-09-10T08:45:00Z'};
 f.remedies.createRemedy(rctx,{id:'remedy:rc1-refund',sourceExceptionId:'exception:rc1-shortfall',originalObligationId:obligationId,participantId:member,kind:'REFUND',quantity:quantity(1,'kg'),createdAt:'2026-09-10T08:42:00Z',authorizedEventId:'event:rc1-refund-authorized',evidenceIds:[eid('evidence:rc1-refund-auth')],economicClassification:'REMEDY_SETTLEMENT'});
 f.app.completeRemedy(rctx,{id:'completion:rc1-refund',remedyObligationId:'remedy:rc1-refund',quantity:quantity(1,'kg'),completedAt:'2026-09-10T08:43:00Z',evidenceIds:[eid('evidence:rc1-refund-settled')],settlementAmount:money(10000n,'GHS')});
 const position=f.resolution.position(commitment.obligation);assert.equal(position.performedQuantity.amount,4);assert.equal(position.remediedQuantity.amount,1);assert.equal(position.unresolvedQuantity.amount,0);

 const governedBenchmark=f.economics.recordGovernedSavingsBenchmark({benchmarkId:'benchmark:rc1',benchmarkVersion:1,valuationId:'valuation:rc1',obligationId,listingId:'listing:rc1-rice',offerId,benchmarkDisplayId:'benchmark-display:rc1',catalogAt:'2026-09-10T08:10:00Z',serviceLevel:'pickup',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',availabilityRuleVersion:'availability:v1',evaluatedAt:'2026-09-10T08:50:00Z'});
 assert.equal(governedBenchmark.valuation.comparableValue.minor,48000n);
 f.economics.recordFulfilledEconomics({id:'member-econ:rc1',obligationId,participantId:member,specificationId:rice,quantity:quantity(4,'kg'),place:benchmarkDisplay.place,serviceLevel:'pickup',goodsOutlay:money(50000n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(10000n,'GHS'),economicEvidenceIds:[receipt.evidenceId,eid('evidence:rc1-refund-settled')],realizedAt:'2026-09-10T08:51:00Z',substitutionEvidenceIds:[]});
 const savings=f.app.calculateSavings({id:'savings:rc1',benchmarkValuationId:'valuation:rc1',memberEconomicsId:'member-econ:rc1',calculatedAt:'2026-09-10T08:52:00Z'});assert.equal(savings.absoluteSavings.minor,8000n);

 const canonical=f.app.canonicalRecords();
 assert.throws(()=>{canonical[0].payload.participantId='participant:forged';},TypeError);
 const firstSnapshot=f.app.rebuildMemberOrderProjection('2026-09-10T08:53:00Z');assertFresh(firstSnapshot,f.app.canonicalRecords());const firstDigest=snapshotDigest(firstSnapshot);
 const view=firstSnapshot.rows.get(String(obligationId));assert.equal(view.participantId,String(member));assert.equal(view.performedQuantity,4);assert.equal(view.remediedQuantity,1);assert.equal(view.unresolvedQuantity,0);assert.equal(view.latestSavingsMinor,8000n);assert.equal(view.sourceRecordIds.length,4);
 const rebuilt=f.app.rebuildMemberOrderProjection('2026-09-10T08:54:00Z');assertFresh(rebuilt,f.app.canonicalRecords());assert.equal(snapshotDigest(rebuilt),firstDigest);
 return {f,active,commitment,receipt,position,savings,benchmarkDisplay,projectionSnapshot:rebuilt};
}

test('SW1-RC1 integrated replay preserves mandatory 5kg -> 4kg performance + 1kg refund conservation',async()=>{
 const {active,commitment,receipt,position,savings,benchmarkDisplay,projectionSnapshot}=await runJourney();
 assert.equal(active.participant.id,member);assert.equal(commitment.obligation.id,obligationId);assert.equal(receipt.economicTreatment,'RESTRICTED_MEMBER_PREPAYMENT');
 assert.equal(position.performedQuantity.amount,4);assert.equal(position.remediedQuantity.amount,1);assert.equal(position.unresolvedQuantity.amount,0);assert.equal(savings.absoluteSavings.minor,8000n);
 assert.equal(benchmarkDisplay.value.minor,60000n);assert.equal(projectionSnapshot.rows.get(String(obligationId)).latestSavingsMinor,8000n);
});

test('SW1-RC1 economics fabrication fields fail closed independently',async()=>{
 const {f,receipt,benchmarkDisplay}=await runJourney();
 const base={obligationId,participantId:member,specificationId:rice,quantity:quantity(4,'kg'),place:benchmarkDisplay.place,serviceLevel:'pickup',goodsOutlay:money(50000n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(10000n,'GHS'),economicEvidenceIds:[receipt.evidenceId,eid('evidence:rc1-refund-settled')],realizedAt:'2026-09-10T09:03:00Z',substitutionEvidenceIds:[]};
 assert.throws(()=>f.economics.recordFulfilledEconomics({...base,id:'member-econ:bad-qty',quantity:quantity(5,'kg')}),/MEMBER_ECONOMICS_NOT_ACTUAL_PERFORMANCE/);
 assert.throws(()=>f.economics.recordFulfilledEconomics({...base,id:'member-econ:bad-outlay',goodsOutlay:money(1n,'GHS')}),/MEMBER_ECONOMICS_OUTLAY_NOT_CANONICAL/);
 assert.throws(()=>f.economics.recordFulfilledEconomics({...base,id:'member-econ:bad-refund',refundApplied:money(9999n,'GHS')}),/MEMBER_ECONOMICS_REFUND_NOT_CANONICAL/);
 assert.throws(()=>f.economics.recordFulfilledEconomics({...base,id:'member-econ:bad-evidence',economicEvidenceIds:[eid('evidence:made-up')]}),/MEMBER_ECONOMICS_EVIDENCE_NOT_CANONICAL/);
});

test('SW1-RC1 every required authority bypass fails closed in integrated state',async()=>{
 const {f}=await runJourney();
 const unauthPrincipal={issuer:'https://auth.rc1.example',subject:'worker-unauthorized',authenticatedAt:'2026-09-10T09:00:00Z',providerEvidenceId:eid('evidence:unauth-auth'),assurance:'STANDARD'};
 assert.throws(()=>f.identity.bindAuthenticatedIdentity({bindingId:'binding:unauthorized',principal:unauthPrincipal,participantId:member,actorId:identityOperator,grantIds:[],at:'2026-09-10T09:01:00Z'}),/IDENTITY_BIND_UNAUTHORIZED:NO_GRANT/);
 const offer=f.catalog.getOffer(offerId);
 assert.throws(()=>f.catalogService.publishOffer({actorId:catalogOperator,grantIds:[],at:'2026-09-10T09:02:00Z'},{salesWindowId:'window:rc1',benchmarkDisplayId:'benchmark-display:rc1',offer}),/CATALOG_UNAUTHORIZED:NO_GRANT/);
 assert.throws(()=>f.inventory.receiveLot({actorId:warehouse,grantIds:[],at:'2026-09-10T09:03:00Z'},{lot:{id:lot('lot:rc1-unauthorized'),specificationId:rice,quantity:quantity(1,'kg')},ownerId:club,custodianId:warehouse,placeId:'warehouse:rc1',receivedAt:'2026-09-10T09:02:30Z',receiptEvidenceIds:[eid('evidence:unauthorized-receipt')]}),/INVENTORY_UNAUTHORIZED:NO_GRANT/);
 assert.throws(()=>f.fulfillment.recordWork({actorId:warehouse,grantIds:[],at:'2026-09-10T09:04:00Z'},{id:'pick:rc1-unauthorized',allocationId:'allocation:rc1',lotId:bulkLot,obligationId,specificationId:rice,quantity:quantity(5,'kg'),state:'PICKED',operatorId:warehouse,placeId:'pickup:rc1',occurredAt:'2026-09-10T09:03:30Z',evidenceIds:[eid('evidence:unauthorized-pick')]}),/FULFILLMENT_UNAUTHORIZED:NO_GRANT/);
 assert.throws(()=>f.remedies.createRemedy({actorId:finance,grantIds:[],at:'2026-09-10T09:05:00Z'},{id:'remedy:rc1-unauthorized',sourceExceptionId:'exception:rc1-shortfall',originalObligationId:obligationId,participantId:member,kind:'REFUND',quantity:quantity(1,'kg'),createdAt:'2026-09-10T09:04:30Z',authorizedEventId:'event:unauthorized-remedy',evidenceIds:[eid('evidence:unauthorized-remedy')],economicClassification:'REMEDY_SETTLEMENT'}),/REMEDY_UNAUTHORIZED:NO_GRANT/);
 assert.throws(()=>f.remedies.completeRemedy({actorId:finance,grantIds:[],at:'2026-09-10T09:05:30Z'},{id:'completion:rc1-unauthorized',remedyObligationId:'remedy:rc1-refund',quantity:quantity(1,'kg'),completedAt:'2026-09-10T09:05:00Z',evidenceIds:[eid('evidence:unauthorized-remedy-completion')],settlementAmount:money(10000n,'GHS')}),/REMEDY_UNAUTHORIZED:NO_GRANT/);
 const ops=new GovernedPilotOperationsService(f.authority);
 assert.throws(()=>ops.executeMutation({actorId:finance,grantIds:[],at:'2026-09-10T09:06:00Z'},{requestId:'req:rc1-unauthorized-admin',action:'admin.obligation.annotate',targetId:String(obligationId),reason:'unauthorized',payload:{}},()=>({result:{ok:true},sourceRecordIds:['forged:admin']})),/ADMIN_UNAUTHORIZED:NO_GRANT/);
});

test('SW1-RC1 recovery cannot redirect a failed authorized operation into a new economic effect',async()=>{
 const {f}=await runJourney();
 const ops=new GovernedPilotOperationsService(f.authority);
 const payload={command:{mode:'NOOP'}};
 const beforeRecords=f.app.canonicalRecords().length;
 assert.throws(()=>ops.executeMutation({actorId:finance,grantIds:[f.grants.adminMutation],at:'2026-09-10T09:06:00Z'},{requestId:'req:rc1-failed-admin',action:'admin.obligation.annotate',targetId:String(obligationId),reason:'simulate uncertain admin write',payload},p=>{
  if(p.command.mode==='FABRICATE_SAVINGS'){
   const forged=f.app.calculateSavings({id:'savings:rc1-recovery-forged',benchmarkValuationId:'valuation:rc1',memberEconomicsId:'member-econ:rc1',calculatedAt:'2026-09-10T09:06:30Z',supersedes:'savings:rc1'});
   return {result:forged,sourceRecordIds:['order:forged-recovery-effect']};
  }
  throw new Error('SIMULATED_TRANSIENT_FAILURE');
 }),/SIMULATED_TRANSIENT_FAILURE/);
 payload.command.mode='FABRICATE_SAVINGS';
 assert.throws(()=>ops.recover({actorId:finance,grantIds:[f.grants.recovery],at:'2026-09-10T09:07:00Z'},{recoveryRequestId:'req:rc1-recovery',originalRequestId:'req:rc1-failed-admin',reason:'reconcile exact failed operation',maxAgeMs:120000},()=>({effectObserved:false,sourceRecordIds:['probe:rc1-no-effect']})),/SIMULATED_TRANSIENT_FAILURE/);
 assert.equal(f.app.canonicalRecords().length,beforeRecords);
 assert.equal(f.economicsLedger.getSavings('savings:rc1-recovery-forged'),undefined);
});

test('SW1-RC1 remaining semantic/tamper attacks fail closed against completed state',async()=>{
 const {f,commitment,projectionSnapshot}=await runJourney();
 const offer=f.catalog.getOffer(offerId),membership=f.memberships.get('membership:rc1');
 f.carts.create({id:'cart:rc1-forged',participantId:member,at:'2026-09-10T09:07:00Z'});f.carts.setSingleLine({cartId:'cart:rc1-forged',participantId:member,offer,quantity:quantity(5,'kg'),at:'2026-09-10T09:08:00Z'});
 await assert.rejects(()=>f.app.checkout({cartId:'cart:rc1-forged',participantId:member,membership,offer,obligationId:oid('obligation:rc1-forged'),authorizedCommandId:cid('command:rc1-forged'),authorizedEventId:'event:rc1-forged',acceptedAt:'2026-09-10T09:09:00Z',policyVersions:['checkout-v1']}),/AUTHORIZED_COMMITMENT_NOT_VERIFIED/);
 const intent=f.payments.createIntent({actorId:member,grantIds:[f.grants.payment],at:'2026-09-10T09:10:00Z'},{obligationId,participantId:member,offer,idempotencyKey:'rc1-payment'});
 const validBody=JSON.stringify({providerReference:intent.providerReference,status:'CONFIRMED',amountMinor:'50000',currency:'GHS',occurredAt:'2026-09-10T09:10:30Z'});
 assert.throws(()=>f.payments.reconcileWebhook({eventId:'event:rc1-forged-signature',rawBody:validBody,signature:'forged',receivedAt:'2026-09-10T09:11:00Z'}),/PAYMENT_WEBHOOK_SIGNATURE_INVALID/);
 const tampered=JSON.stringify({providerReference:intent.providerReference,status:'CONFIRMED',amountMinor:'1',currency:'GHS',occurredAt:'2026-09-10T09:11:30Z'});
 assert.throws(()=>f.payments.reconcileWebhook({eventId:'event:rc1-tampered',rawBody:tampered,signature:`sandbox:rc1-secret:${tampered}`,receivedAt:'2026-09-10T09:12:00Z'}),/PAYMENT_AMOUNT_MISMATCH/);
 assert.throws(()=>f.fulfillment.recordException({actorId:member,grantIds:[f.grants.memberFulfillment],at:'2026-09-10T09:13:00Z'},{id:'exception:rc1-overclaim',obligationId,participantId:member,kind:'SHORTFALL',affectedQuantity:quantity(1,'kg'),occurredAt:'2026-09-10T09:12:30Z',evidenceIds:[eid('evidence:rc1-overclaim')],relatedAcceptanceId:'acceptance:rc1'}),/EXCEPTION_EXCEEDS_UNRESOLVED_QUANTITY/);
 assert.throws(()=>f.remedies.createRemedy({actorId:finance,grantIds:[f.grants.remedy],at:'2026-09-10T09:14:00Z'},{id:'remedy:rc1-fabricated',sourceExceptionId:'exception:rc1-missing',originalObligationId:obligationId,participantId:member,kind:'REFUND',quantity:quantity(1,'kg'),createdAt:'2026-09-10T09:13:30Z',authorizedEventId:'event:rc1-fabricated-remedy',evidenceIds:[eid('evidence:rc1-fabricated-remedy')],economicClassification:'REMEDY_SETTLEMENT'}),/REMEDY_EXCEPTION_MISMATCH/);
 f.app.calculateSavings({id:'savings:rc1-correction',benchmarkValuationId:'valuation:rc1',memberEconomicsId:'member-econ:rc1',calculatedAt:'2026-09-10T09:15:00Z',supersedes:'savings:rc1'});
 assert.throws(()=>assertFresh(projectionSnapshot,f.app.canonicalRecords()),/PROJECTION_STALE/);
 assert.equal(commitment.obligation.quantity.amount,5);
});
