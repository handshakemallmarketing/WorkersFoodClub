import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity} from '../../dist/packages/kernel/src/index.js';
import {ExplicitPhysicalLineageLedger} from '../../dist/packages/lineage/src/index.js';

const eid=x=>asId(x);

test('INV-007/008 explicit multi-input multi-output transform conserves exact per-lot quantities',()=>{
 const l=new ExplicitPhysicalLineageLedger();
 l.registerLot('lot:a',quantity(40,'kg'));l.registerLot('lot:b',quantity(60,'kg'));
 const t=l.transform({id:'transform:blend',kind:'PROCESS',inputs:[{lotId:'lot:a',quantity:quantity(40,'kg')},{lotId:'lot:b',quantity:quantity(60,'kg')}],outputs:[{lotId:'lot:c',quantity:quantity(70,'kg')},{lotId:'lot:d',quantity:quantity(27,'kg')}],lossQuantity:quantity(3,'kg'),occurredAt:'2026-09-08T02:10:00Z',evidenceIds:[eid('evidence:blend')]});
 assert.equal(t.inputs[0].quantity.amount,40);assert.equal(t.inputs[1].quantity.amount,60);assert.equal(t.outputs[0].quantity.amount,70);assert.equal(t.outputs[1].quantity.amount,27);
 assert.equal(l.remaining('lot:a').amount,0);assert.equal(l.remaining('lot:b').amount,0);assert.equal(l.remaining('lot:c').amount,70);assert.equal(l.remaining('lot:d').amount,27);
 assert.deepEqual(l.ancestry('lot:c').map(x=>[x.transformId,x.direction,x.quantity.amount]),[['transform:blend','OUTPUT',70]]);
});

test('INV-008 output quantities are explicit and never inferred by equal split',()=>{
 const l=new ExplicitPhysicalLineageLedger();l.registerLot('lot:a',quantity(10,'kg'));
 l.transform({id:'transform:split',kind:'SPLIT',inputs:[{lotId:'lot:a',quantity:quantity(10,'kg')}],outputs:[{lotId:'lot:b',quantity:quantity(9,'kg')},{lotId:'lot:c',quantity:quantity(1,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:'2026-09-08T02:11:00Z',evidenceIds:[eid('evidence:split')]});
 assert.equal(l.remaining('lot:b').amount,9);assert.equal(l.remaining('lot:c').amount,1);
});

test('INV-007 cumulative consumption rejects cross-transform overconsumption',()=>{
 const l=new ExplicitPhysicalLineageLedger();l.registerLot('lot:a',quantity(10,'kg'));
 l.transform({id:'transform:1',kind:'REPACK',inputs:[{lotId:'lot:a',quantity:quantity(7,'kg')}],outputs:[{lotId:'lot:b',quantity:quantity(7,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:'2026-09-08T02:12:00Z',evidenceIds:[eid('evidence:1')]});
 assert.throws(()=>l.transform({id:'transform:2',kind:'REPACK',inputs:[{lotId:'lot:a',quantity:quantity(4,'kg')}],outputs:[{lotId:'lot:c',quantity:quantity(4,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:'2026-09-08T02:13:00Z',evidenceIds:[eid('evidence:2')]}),/TRANSFORMATION_INPUT_OVERCONSUMED/);
 assert.equal(l.remaining('lot:a').amount,3);
});

test('INV-007 rejects non-conserved explicit transform before mutating lineage',()=>{
 const l=new ExplicitPhysicalLineageLedger();l.registerLot('lot:a',quantity(10,'kg'));
 assert.throws(()=>l.transform({id:'transform:bad',kind:'PROCESS',inputs:[{lotId:'lot:a',quantity:quantity(10,'kg')}],outputs:[{lotId:'lot:b',quantity:quantity(8,'kg')}],lossQuantity:quantity(1,'kg'),occurredAt:'2026-09-08T02:14:00Z',evidenceIds:[eid('evidence:bad')]}),/TRANSFORMATION_NOT_CONSERVED/);
 assert.equal(l.remaining('lot:a').amount,10);assert.throws(()=>l.remaining('lot:b'),/LINEAGE_LOT_UNKNOWN/);
});
