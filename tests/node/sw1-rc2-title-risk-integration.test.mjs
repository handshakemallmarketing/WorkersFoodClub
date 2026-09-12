import test from 'node:test';
import assert from 'node:assert/strict';
import {asId} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {InMemoryFulfillmentLedger} from '../../dist/packages/fulfillment/src/index.js';
import {GovernedTransferPolicyRegistry,GovernedTransferEvaluator,transferEventFromAcceptance} from '../../dist/packages/transfer/src/index.js';

const id=x=>asId(x);

function ratifiedEvaluator(){
 const authority=new InMemoryAuthorityStore();
 authority.put({id:id('grant:gh-pilot-transfer'),grantorId:id('participant:founder'),actorId:id('participant:board'),actions:['RatifyTransferPolicy'],targetPrefix:'GH-PILOT-TITLE-RISK',validFrom:'2026-09-01T00:00:00Z'});
 const registry=new GovernedTransferPolicyRegistry(new AuthorityEvaluator(authority),()=> '2026-09-11T15:00:00Z');
 registry.ratify({id:'GH-PILOT-TITLE-RISK',version:1,transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',title:{dimension:'TITLE',trigger:'ACCEPTANCE'},risk:{dimension:'RISK',trigger:'ACCEPTANCE'},effectiveFrom:'2026-09-11T15:00:00Z',authorizedBy:id('participant:board'),authorityGrantId:'grant:gh-pilot-transfer',evidenceIds:[id('evidence:test-ratification')],status:'RATIFIED'});
 return new GovernedTransferEvaluator(registry);
}

function canonicalPartialAcceptance(){
 const resolution=new InMemoryObligationResolutionLedger();
 const fulfillment=new InMemoryFulfillmentLedger(resolution);
 const obligation={id:id('obligation:pilot:1'),beneficiary:id('participant:member:1'),quantity:{amount:10,unit:'kg'}};
 const allocation={allocationId:'allocation:1',lotId:id('lot:1'),obligationId:obligation.id,specificationId:id('spec:rice'),quantity:{amount:10,unit:'kg'},allocatedAt:'2026-09-11T15:00:00Z'};
 const work=fulfillment.recordWork({id:'work:1',allocationId:'allocation:1',lotId:id('lot:1'),obligationId:obligation.id,specificationId:id('spec:rice'),quantity:{amount:10,unit:'kg'},state:'PICKED',operatorId:id('participant:operator'),placeId:'pickup:1',occurredAt:'2026-09-11T15:01:00Z',evidenceIds:[id('evidence:pick')]},allocation);
 const packed=fulfillment.recordWork({...work,id:'work:2',state:'PACKED',occurredAt:'2026-09-11T15:02:00Z',supersedes:'work:1',evidenceIds:[id('evidence:pack')]},allocation);
 const ready=fulfillment.recordWork({...packed,id:'work:3',state:'READY_FOR_PICKUP',occurredAt:'2026-09-11T15:03:00Z',supersedes:'work:2',evidenceIds:[id('evidence:ready')]},allocation);
 fulfillment.handover({id:'handover:1',fulfillmentWorkId:ready.id,obligationId:obligation.id,fromCustodianId:id('participant:operator'),toParticipantId:obligation.beneficiary,placeId:'pickup:1',handedOverAt:'2026-09-11T15:04:00Z',evidenceIds:[id('evidence:handover')]},obligation);
 const acceptance=fulfillment.accept({id:'acceptance:1',handoverId:'handover:1',obligationId:obligation.id,participantId:obligation.beneficiary,state:'PARTIALLY_ACCEPTED',quantity:{amount:8,unit:'kg'},acceptedAt:'2026-09-11T15:05:00Z',evidenceIds:[id('evidence:acceptance')]},obligation);
 return {acceptance,obligation,resolution};
}

test('RC2-LEGAL-001 canonical fulfillment acceptance drives exact quantity-aware title and risk transfer',()=>{
 const {acceptance,obligation,resolution}=canonicalPartialAcceptance();
 const transferEvent=transferEventFromAcceptance(acceptance);
 assert.ok(transferEvent);
 assert.equal(transferEvent.id,acceptance.id);
 assert.equal(transferEvent.transactionId,obligation.id);
 assert.deepEqual(transferEvent.quantity,{amount:8,unit:'kg'});
 const result=ratifiedEvaluator().evaluateQuantities({transactionId:String(obligation.id),transactionType:'GH_PILOT_MEMBER_FOOD_ORDER',policyId:'GH-PILOT-TITLE-RISK',policyVersion:1,totalQuantity:obligation.quantity,events:[transferEvent]});
 assert.deepEqual(result.titleTransferredQuantity,{amount:8,unit:'kg'});
 assert.deepEqual(result.riskTransferredQuantity,{amount:8,unit:'kg'});
 assert.equal(result.titleComplete,false);assert.equal(result.riskComplete,false);
 assert.deepEqual(resolution.position(obligation).performedQuantity,{amount:8,unit:'kg'});
});

test('rejected canonical acceptance cannot create a title/risk transfer event',()=>{
 const rejected={id:'acceptance:rejected',obligationId:'obligation:pilot:2',state:'REJECTED',quantity:{amount:0,unit:'kg'},acceptedAt:'2026-09-11T15:05:00Z',evidenceIds:[id('evidence:rejection')]};
 assert.equal(transferEventFromAcceptance(rejected),undefined);
 assert.throws(()=>transferEventFromAcceptance({...rejected,quantity:{amount:1,unit:'kg'}}),/TRANSFER_REJECTED_ACCEPTANCE_QUANTITY_INVALID/);
});

test('acceptance adapter fails closed on malformed or unattributed source records',()=>{
 const base={id:'acceptance:1',obligationId:'obligation:1',state:'ACCEPTED',quantity:{amount:1,unit:'kg'},acceptedAt:'2026-09-11T15:05:00Z',evidenceIds:[id('evidence:a')]};
 assert.throws(()=>transferEventFromAcceptance({...base,evidenceIds:[]}),/TRANSFER_ACCEPTANCE_SOURCE_INVALID/);
 assert.throws(()=>transferEventFromAcceptance({...base,acceptedAt:'not-a-time'}),/TRANSFER_ACCEPTANCE_SOURCE_INVALID/);
 assert.throws(()=>transferEventFromAcceptance({...base,quantity:{amount:0,unit:'kg'}}),/TRANSFER_ACCEPTANCE_QUANTITY_INVALID/);
});
