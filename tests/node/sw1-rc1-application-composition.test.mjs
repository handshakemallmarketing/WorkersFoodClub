import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity} from '../../dist/packages/kernel/src/index.js';
import {PilotOrderApplicationService} from '../../dist/packages/application/src/pilot-order.js';

const id=x=>asId(x);
const obligationId=id('obligation:rc1-composition');
const participantId=id('participant:rc1-composition-member');
const spec=id('spec:rc1-composition-rice');
const commitment=Object.freeze({
 obligation:Object.freeze({id:obligationId,obligor:participantId,beneficiary:id('participant:food-club'),specificationId:spec,quantity:quantity(5,'kg'),state:'OPEN'}),
 participantId,
 acceptedAt:'2026-09-10T08:17:00Z'
});
const demand={getCommitment:id=>id===obligationId?commitment:undefined};
const unusedCheckout={};
const unusedEconomics={};

test('SW1-RC1 application coordinator rejects fulfillment/remedy resolution-ledger mismatch',()=>{
 const fulfillment={resolutionLedger:()=>({name:'fulfillment-ledger'})};
 const remedy={resolutionLedger:()=>({name:'remedy-ledger'})};
 assert.throws(()=>new PilotOrderApplicationService(unusedCheckout,fulfillment,remedy,unusedEconomics,demand),/ORDER_STREAM_RESOLUTION_LEDGER_MISMATCH/);
});

test('SW1-RC1 acceptance and remedy completion may reuse domain-local effect ID without canonical collision',()=>{
 const sharedResolution={name:'shared-resolution'};
 let position={performedQuantity:quantity(0,'kg'),remediedQuantity:quantity(0,'kg'),unresolvedQuantity:quantity(5,'kg')};
 const fulfillment={
  resolutionLedger:()=>sharedResolution,
  accept:(_ctx,input)=>{
   position={performedQuantity:quantity(4,'kg'),remediedQuantity:quantity(0,'kg'),unresolvedQuantity:quantity(1,'kg')};
   return Object.freeze({...input});
  }
 };
 const remedy={
  resolutionLedger:()=>sharedResolution,
  position:()=>position,
  getRemedy:id=>id==='remedy:rc1-composition'?Object.freeze({id,originalObligationId:obligationId}):undefined,
  completeRemedy:(_ctx,input)=>{
   position={performedQuantity:quantity(4,'kg'),remediedQuantity:quantity(1,'kg'),unresolvedQuantity:quantity(0,'kg')};
   return Object.freeze({...input});
  }
 };
 const app=new PilotOrderApplicationService(unusedCheckout,fulfillment,remedy,unusedEconomics,demand);
 const sharedId='effect:shared-domain-local-id';
 app.accept({}, {id:sharedId,handoverId:'handover:1',obligationId,participantId,state:'PARTIALLY_ACCEPTED',quantity:quantity(4,'kg'),acceptedAt:'2026-09-10T08:37:00Z',evidenceIds:[id('evidence:acceptance')]});
 app.completeRemedy({}, {id:sharedId,remedyObligationId:'remedy:rc1-composition',quantity:quantity(1,'kg'),completedAt:'2026-09-10T08:43:00Z',evidenceIds:[id('evidence:remedy')]});
 const records=app.canonicalRecords();
 assert.equal(records.length,2);
 assert.deepEqual(records.map(r=>r.recordId),[
  `order:${String(obligationId)}:resolution:acceptance:${sharedId}`,
  `order:${String(obligationId)}:resolution:remedy:${sharedId}`
 ]);
 const view=app.rebuildMemberOrderProjection('2026-09-10T08:44:00Z');
 assert.equal(view.rows.get(String(obligationId)),undefined,'resolution-only stream must not invent a commitment projection');
});
