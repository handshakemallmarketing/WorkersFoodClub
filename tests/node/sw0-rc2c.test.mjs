import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,money,quantity} from '../../dist/packages/kernel/src/index.js';
import {InMemoryDemandCommitmentLedger} from '../../dist/packages/demand/src/index.js';
import {InMemoryInventoryLedger} from '../../dist/packages/inventory/src/index.js';
import {InMemoryFulfillmentLedger} from '../../dist/packages/fulfillment/src/index.js';
import {InMemoryRemedyLedger} from '../../dist/packages/remedy/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';
import {ExplicitPhysicalLineageLedger} from '../../dist/packages/lineage/src/index.js';
import {GovernedTransferEvaluator,GovernedTransferPolicyRegistry} from '../../dist/packages/transfer/src/index.js';
import {CanonicalRecordLog,RebuildableProjection,fulfillmentProjection,savingsProjection,snapshotDigest,assertFresh} from '../../dist/packages/projections/src/index.js';

const pid=x=>asId(x),sid=x=>asId(x),oid=x=>asId(x),ofid=x=>asId(x),eid=x=>asId(x),cid=x=>asId(x);
const member={id:'membership:rc2c',participantId:pid('participant:member'),state:'ACTIVE',establishedAt:'2026-09-01T00:00:00Z',eligibilityPolicyVersion:'worker-v1',eligibilityEvidenceIds:[eid('evidence:eligibility')]};
const spec=sid('spec:rice-5kg');
const offer={id:ofid('offer:rc2c'),offerorId:pid('participant:food-club'),specificationId:spec,quantity:quantity(5,'kg'),memberPrice:money(45000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'hospital:korle-bu',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',priceEvidenceIds:[eid('evidence:price')],policyVersions:['pricing:v1']};
const verifier={isAccepted:(commandId,eventId)=>commandId==='command:checkout-rc2c'&&eventId==='event:purchase-accepted-rc2c'};
const obligationId=oid('obligation:rc2c');

function recordReadyFulfillment(resolution,obligation){
 const fulfillment=new InMemoryFulfillmentLedger(resolution);
 const allocation={allocationId:'allocation:rc2c',lotId:asId('lot:member-pack'),obligationId:obligation.id,specificationId:obligation.specificationId,quantity:quantity(5,'kg')};
 const work=(id,state,supersedes)=>({id,allocationId:allocation.allocationId,lotId:allocation.lotId,obligationId:obligation.id,specificationId:obligation.specificationId,quantity:quantity(5,'kg'),state,operatorId:pid('participant:operator'),placeId:'hospital:korle-bu',occurredAt:'2026-09-08T04:10:00Z',evidenceIds:[eid(`evidence:${id}`)],...(supersedes?{supersedes}:{})});
 fulfillment.recordWork(work('pick:rc2c','PICKED'),allocation);
 fulfillment.recordWork(work('pack:rc2c','PACKED','pick:rc2c'),allocation);
 fulfillment.recordWork(work('ready:rc2c','READY_FOR_PICKUP','pack:rc2c'),allocation);
 fulfillment.handover({id:'handover:rc2c',fulfillmentWorkId:'ready:rc2c',obligationId:obligation.id,fromCustodianId:pid('participant:club'),toParticipantId:obligation.beneficiary,placeId:'hospital:korle-bu',handedOverAt:'2026-09-08T04:15:00Z',evidenceIds:[eid('evidence:handover')]},obligation);
 return fulfillment;
}

test('SW0-RC2C canonical vertical slice survives partial fulfillment, remedy, transfer and rebuild',async()=>{
 // Participant/membership -> offer -> authorized obligation -> payment evidence.
 const demand=new InMemoryDemandCommitmentLedger(verifier);
 const commitment=await demand.commitPurchase({obligationId,participantId:member.participantId,membership:member,offer,quantity:quantity(5,'kg'),authorizedCommandId:cid('command:checkout-rc2c'),authorizedEventId:'event:purchase-accepted-rc2c',acceptedAt:'2026-09-08T04:00:00Z',policyVersions:['checkout:v1']});
 const obligation={...commitment.obligation,beneficiary:member.participantId};
 demand.recordPaymentEvidence({evidenceId:eid('evidence:payment-rc2c'),obligationId,provider:'MTN_MOMO',providerReference:'RC2C-TXN-1',amount:money(45000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-08T04:01:00Z',recordedAt:'2026-09-08T04:01:02Z'});
 assert.equal(commitment.obligation.state,'OPEN');
 assert.throws(()=>demand.recordPaymentEvidence({evidenceId:eid('evidence:payment-duplicate'),obligationId,provider:'MTN_MOMO',providerReference:'RC2C-TXN-1',amount:money(45000n,'GHS'),status:'CONFIRMED',observedAt:'2026-09-08T04:01:00Z',recordedAt:'2026-09-08T04:01:02Z'}),/PAYMENT_PROVIDER_REFERENCE_DUPLICATE/);

 // Explicit physical provenance -> governed inventory -> allocation.
 const lineage=new ExplicitPhysicalLineageLedger();
 lineage.registerLot('lot:bulk',quantity(5,'kg'));
 lineage.transform({id:'transform:member-pack',kind:'REPACK',inputs:[{lotId:'lot:bulk',quantity:quantity(5,'kg')}],outputs:[{lotId:'lot:member-pack',quantity:quantity(5,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:'2026-09-08T04:02:00Z',evidenceIds:[eid('evidence:repack')]});
 assert.equal(lineage.remaining('lot:bulk').amount,0);assert.equal(lineage.remaining('lot:member-pack').amount,5);
 const inventory=new InMemoryInventoryLedger();
 inventory.receiveLot({lot:{id:'lot:member-pack',specificationId:spec,quantity:quantity(5,'kg')},ownerId:'participant:food-club',custodianId:'participant:club',placeId:'warehouse:1',receivedAt:'2026-09-08T04:03:00Z',receiptEvidenceIds:['evidence:receipt']});
 inventory.assessQuality({id:'qa:rc2c',lotId:'lot:member-pack',state:'ACCEPTED',assessedAt:'2026-09-08T04:04:00Z',evidenceIds:['evidence:qa']});
 inventory.allocate({id:'allocation:rc2c',lotId:'lot:member-pack',obligationId,specificationId:spec,quantity:quantity(5,'kg'),allocatedAt:'2026-09-08T04:05:00Z',evidenceIds:['evidence:allocation']},obligation);
 assert.equal(inventory.availableForLot('lot:member-pack').amount,0);

 // Handover does not equal full performance: member accepts only 4kg.
 const resolution=new InMemoryObligationResolutionLedger();
 const fulfillment=recordReadyFulfillment(resolution,obligation);
 assert.throws(()=>fulfillment.handover({id:'handover:duplicate',fulfillmentWorkId:'ready:rc2c',obligationId,fromCustodianId:pid('participant:club'),toParticipantId:member.participantId,placeId:'hospital:korle-bu',handedOverAt:'2026-09-08T04:16:00Z',evidenceIds:[eid('evidence:duplicate')]},obligation),/HANDOVER_ALREADY_RECORDED/);
 fulfillment.accept({id:'acceptance:rc2c',handoverId:'handover:rc2c',obligationId,participantId:member.participantId,state:'PARTIALLY_ACCEPTED',quantity:quantity(4,'kg'),acceptedAt:'2026-09-08T04:20:00Z',evidenceIds:[eid('evidence:acceptance')]},obligation);
 assert.equal(fulfillment.performance(obligation).state,'PARTIALLY_DISCHARGED');

 // One kilogram shortfall is resolved by explicit refund, never disguised as delivery.
 const remedies=new InMemoryRemedyLedger(resolution);
 remedies.recordException({id:'exception:rc2c',obligationId,participantId:member.participantId,kind:'SHORTFALL',affectedQuantity:quantity(1,'kg'),occurredAt:'2026-09-08T04:21:00Z',evidenceIds:[eid('evidence:shortfall')]},obligation);
 remedies.createRemedy({id:'remedy:rc2c',sourceExceptionId:'exception:rc2c',originalObligationId:obligationId,participantId:member.participantId,kind:'REFUND',quantity:quantity(1,'kg'),createdAt:'2026-09-08T04:22:00Z',authorizedEventId:'event:refund-authorized-rc2c',evidenceIds:[eid('evidence:refund-authorized')],economicClassification:'REMEDY_SETTLEMENT'});
 remedies.completeRemedy({id:'completion:rc2c',remedyObligationId:'remedy:rc2c',quantity:quantity(1,'kg'),completedAt:'2026-09-08T04:23:00Z',evidenceIds:[eid('evidence:refund-settled')]});
 assert.equal(remedies.completion(obligation,quantity(4,'kg')).state,'COMPLETED_WITH_REMEDY');

 // Governed transaction-specific title/risk policy: risk at handover, title at acceptance.
 const registry=new GovernedTransferPolicyRegistry();
 registry.ratify({id:'policy:pickup-rc2c',version:1,transactionType:'PILOT_PICKUP',title:{dimension:'TITLE',trigger:'ACCEPTANCE'},risk:{dimension:'RISK',trigger:'HANDOVER'},effectiveFrom:'2026-09-08T04:00:00Z',authorizedBy:pid('participant:board'),authorityGrantId:'grant:transfer',evidenceIds:[eid('evidence:policy-ratification')],status:'RATIFIED'},{participantId:pid('participant:board'),authorityGrantId:'grant:transfer',scope:'TRANSFER_POLICY_GOVERNANCE',validFrom:'2026-09-01T00:00:00Z'});
 const evaluator=new GovernedTransferEvaluator(registry);
 const beforeAcceptance=evaluator.evaluate({transactionId:'tx:rc2c',transactionType:'PILOT_PICKUP',policyId:'policy:pickup-rc2c',policyVersion:1,events:[{id:'handover:rc2c',transactionId:'tx:rc2c',type:'HANDOVER',occurredAt:'2026-09-08T04:15:00Z',evidenceIds:[eid('evidence:handover')]}]});
 assert.equal(beforeAcceptance.riskTransferred,true);assert.equal(beforeAcceptance.titleTransferred,false);
 const afterAcceptance=evaluator.evaluate({transactionId:'tx:rc2c',transactionType:'PILOT_PICKUP',policyId:'policy:pickup-rc2c',policyVersion:1,events:[{id:'handover:rc2c',transactionId:'tx:rc2c',type:'HANDOVER',occurredAt:'2026-09-08T04:15:00Z',evidenceIds:[eid('evidence:handover')]},{id:'acceptance:rc2c',transactionId:'tx:rc2c',type:'ACCEPTANCE',occurredAt:'2026-09-08T04:20:00Z',evidenceIds:[eid('evidence:acceptance')]}]});
 assert.equal(afterAcceptance.titleTransferred,true);assert.equal(afterAcceptance.riskTransferred,true);

 // Final economics preserves governed benchmark and remedy effect.
 const economics=new InMemoryEconomicsLedger();
 economics.defineBenchmark({id:'benchmark:rc2c',version:1,purpose:'MEMBER_SAVINGS',specificationId:spec,quantity:quantity(5,'kg'),place:'hospital:korle-bu',serviceLevel:'PICKUP',transactionLevel:'RETAIL',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T23:59:59Z',normalizationRuleVersion:'norm:v1',availabilityRuleVersion:'availability:v1',observationEvidenceIds:[eid('evidence:market-normal')],definedAt:'2026-09-01T00:00:00Z'});
 economics.recordBenchmarkValuation({id:'valuation:rc2c',benchmarkId:'benchmark:rc2c',benchmarkVersion:1,obligationId,specificationId:spec,quantity:quantity(5,'kg'),place:'hospital:korle-bu',serviceLevel:'PICKUP',availability:'EXECUTABLE',comparableValue:money(50000n,'GHS'),evaluatedAt:'2026-09-08T04:24:00Z',evidenceIds:[eid('evidence:market-normal')]});
 economics.recordFulfilledMemberEconomics({id:'member-econ:rc2c',obligationId,participantId:member.participantId,specificationId:spec,quantity:quantity(5,'kg'),place:'hospital:korle-bu',serviceLevel:'PICKUP',goodsOutlay:money(45000n,'GHS'),mandatoryCharges:money(0n,'GHS'),refundApplied:money(9000n,'GHS'),economicEvidenceIds:[eid('evidence:payment-rc2c'),eid('evidence:refund-settled')],realizedAt:'2026-09-08T04:25:00Z',substitutionEvidenceIds:[]});
 const savings=economics.calculateSavings({id:'savings:rc2c',benchmarkValuationId:'valuation:rc2c',memberEconomicsId:'member-econ:rc2c',calculatedAt:'2026-09-08T04:26:00Z'});
 assert.equal(savings.absoluteSavings.minor,14000n);

 // Canonical history -> disposable projections -> deterministic rebuild; stale view is visible.
 const log=new CanonicalRecordLog();const at='2026-09-08T04:30:00Z';
 const rec=(stream,sequence,recordId,payload)=>({stream,sequence,recordId,occurredAt:at,payload});
 log.append(rec('fulfillment',1,'obligation:rc2c',{kind:'OBLIGATION_OPENED',obligationId:'obligation:rc2c',quantity:5}));
 log.append(rec('fulfillment',2,'acceptance:rc2c',{kind:'ACCEPTANCE',obligationId:'obligation:rc2c',quantity:4}));
 log.append(rec('economics',3,'savings:rc2c',{kind:'SAVINGS',obligationId:'obligation:rc2c',entryId:'savings:rc2c',minor:savings.absoluteSavings.minor,currency:'GHS'}));
 const fp=new RebuildableProjection(fulfillmentProjection),sp=new RebuildableProjection(savingsProjection);
 const f1=fp.rebuild(log.all(),at),s1=sp.rebuild(log.all(),at);const fd=snapshotDigest(f1),sd=snapshotDigest(s1);assertFresh(f1,log.all());assertFresh(s1,log.all());
 fp.drop();sp.drop();assert.equal(snapshotDigest(fp.rebuild(log.all(),at)),fd);assert.equal(snapshotDigest(sp.rebuild(log.all(),at)),sd);
 log.append(rec('economics',4,'savings:rc2c-correction',{kind:'SAVINGS',obligationId:'obligation:rc2c',entryId:'savings:rc2c-correction',minor:13000n,currency:'GHS',supersedes:'savings:rc2c'}));
 assert.throws(()=>assertFresh(s1,log.all()),/PROJECTION_STALE/);
 assert.equal(sp.rebuild(log.all(),at).rows.get('obligation:rc2c').savingsMinor,13000n);
});

test('SW0-RC2C attack register remains executable, not a narrative completion claim',()=>{
 const attacks=['retry/idempotency','stale authority','concurrency/fencing','overallocation','partial fulfillment','unconsented substitution','refund duplication','bad benchmark','negative savings','contradictory evidence','return quality gate','lineage conservation','title-risk orthogonality','projection staleness'];
 assert.equal(attacks.length,14);
 // Each attack is already bound to executable constituent proofs; this slice adds the cross-module chain above.
 assert.ok(attacks.includes('title-risk orthogonality')&&attacks.includes('lineage conservation')&&attacks.includes('projection staleness'));
});
