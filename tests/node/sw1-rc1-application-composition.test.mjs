import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity} from '../../dist/packages/kernel/src/index.js';
import {InMemoryRemedyLedger} from '../../dist/packages/remedy/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {GovernedPilotRemedyService} from '../../dist/packages/pilot-remedies/src/index.js';
import {PilotOrderApplicationService} from '../../dist/packages/application/src/pilot-order.js';

const id=x=>asId(x);
const obligationId=id('obligation:rc1-composition');
const participantId=id('participant:rc1-composition-member');
const spec=id('spec:rc1-composition-rice');
const commitment=Object.freeze({obligation:Object.freeze({id:obligationId,obligor:participantId,beneficiary:id('participant:food-club'),specificationId:spec,quantity:quantity(5,'kg'),state:'OPEN'}),participantId,acceptedAt:'2026-09-10T08:17:00Z'});
const demand={getCommitment:id=>id===obligationId?commitment:undefined};
const unusedCheckout={};
const key=(...parts)=>parts.map(part=>`${part.length}:${part}`).join('|');

test('SW1-RC1 application coordinator rejects fulfillment/remedy resolution-ledger mismatch',()=>{
 const fulfillmentLedger={name:'fulfillment-ledger'};
 const fulfillment={resolutionLedger:()=>fulfillmentLedger};
 const remedy={resolutionLedger:()=>({name:'remedy-ledger'})};
 const economics={resolutionLedger:()=>fulfillmentLedger};
 assert.throws(()=>new PilotOrderApplicationService(unusedCheckout,fulfillment,remedy,economics,demand),/ORDER_STREAM_RESOLUTION_LEDGER_MISMATCH/);
});

test('SW1-RC1 governed remedy service rejects a wrapper resolution ledger different from its embedded remedy ledger',()=>{
 const embedded=new InMemoryObligationResolutionLedger();
 const supplied=new InMemoryObligationResolutionLedger();
 const remedies=new InMemoryRemedyLedger(embedded);
 assert.throws(()=>new GovernedPilotRemedyService({}, {getCommitment:()=>undefined}, remedies, supplied),/REMEDY_RESOLUTION_LEDGER_MISMATCH/);
});

test('SW1-RC1 application coordinator rejects economics resolution-ledger mismatch',()=>{
 const shared={name:'shared'};
 const fulfillment={resolutionLedger:()=>shared};
 const remedy={resolutionLedger:()=>shared};
 const economics={resolutionLedger:()=>({name:'economics-other'})};
 assert.throws(()=>new PilotOrderApplicationService(unusedCheckout,fulfillment,remedy,economics,demand),/ORDER_STREAM_RESOLUTION_LEDGER_MISMATCH/);
});

test('SW1-RC1 acceptance and remedy completion may reuse domain-local effect ID without canonical collision',()=>{
 const sharedResolution={name:'shared-resolution'};
 let position={performedQuantity:quantity(0,'kg'),remediedQuantity:quantity(0,'kg'),unresolvedQuantity:quantity(5,'kg')};
 const fulfillment={resolutionLedger:()=>sharedResolution,accept:(_ctx,input)=>{position={performedQuantity:quantity(4,'kg'),remediedQuantity:quantity(0,'kg'),unresolvedQuantity:quantity(1,'kg')};return Object.freeze({...input});}};
 const remedy={resolutionLedger:()=>sharedResolution,position:()=>position,getRemedy:id=>id==='remedy:rc1-composition'?Object.freeze({id,originalObligationId:obligationId}):undefined,completeRemedy:(_ctx,input)=>{position={performedQuantity:quantity(4,'kg'),remediedQuantity:quantity(1,'kg'),unresolvedQuantity:quantity(0,'kg')};return Object.freeze({...input});}};
 const economics={resolutionLedger:()=>sharedResolution};
 const app=new PilotOrderApplicationService(unusedCheckout,fulfillment,remedy,economics,demand);
 const sharedId='effect:shared-domain-local-id';
 app.accept({}, {id:sharedId,handoverId:'handover:1',obligationId,participantId,state:'PARTIALLY_ACCEPTED',quantity:quantity(4,'kg'),acceptedAt:'2026-09-10T08:37:00Z',evidenceIds:[id('evidence:acceptance')]});
 app.completeRemedy({}, {id:sharedId,remedyObligationId:'remedy:rc1-composition',quantity:quantity(1,'kg'),completedAt:'2026-09-10T08:43:00Z',evidenceIds:[id('evidence:remedy')]});
 const records=app.canonicalRecords();
 assert.equal(records.length,2);
 assert.deepEqual(records.map(r=>r.recordId),[key('order',String(obligationId),'resolution','acceptance',sharedId),key('order',String(obligationId),'resolution','remedy',sharedId)]);
 assert.notEqual(records[0].recordId,records[1].recordId);
 assert.equal(records[0].payload.performedQuantity,4);
 assert.equal(records[1].payload.remediedQuantity,1);
});

test('SW1-RC1 length-prefixed canonical keys cannot collide through delimiter-bearing IDs',async()=>{
 const sharedResolution={name:'shared-resolution'};
 const obligationA=id('a');
 const obligationB=id('a:resolution:acceptance:b');
 const makeCommitment=oid=>Object.freeze({obligation:Object.freeze({id:oid,obligor:participantId,beneficiary:id('participant:food-club'),specificationId:spec,quantity:quantity(1,'kg'),state:'OPEN'}),participantId,acceptedAt:'2026-09-10T08:17:00Z'});
 const commitments=new Map([[obligationA,makeCommitment(obligationA)],[obligationB,makeCommitment(obligationB)]]);
 const multiDemand={getCommitment:id=>commitments.get(id)};
 let position={performedQuantity:quantity(1,'kg'),remediedQuantity:quantity(0,'kg'),unresolvedQuantity:quantity(0,'kg')};
 const fulfillment={resolutionLedger:()=>sharedResolution,accept:(_ctx,input)=>Object.freeze({...input})};
 const remedy={resolutionLedger:()=>sharedResolution,position:()=>position,getRemedy:()=>undefined};
 const economics={resolutionLedger:()=>sharedResolution};
 const checkout={checkout:async()=>commitments.get(obligationB)};
 const app=new PilotOrderApplicationService(checkout,fulfillment,remedy,economics,multiDemand);
 await app.checkout({});
 app.accept({}, {id:'b',handoverId:'handover:b',obligationId:obligationA,participantId,state:'ACCEPTED',quantity:quantity(1,'kg'),acceptedAt:'2026-09-10T08:37:00Z',evidenceIds:[id('evidence:b')]});
 const records=app.canonicalRecords();
 assert.equal(records.length,2);
 assert.notEqual(records[0].recordId,records[1].recordId);
 assert.equal(new Set(records.map(r=>r.recordId)).size,2);
});
