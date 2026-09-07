import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryInventoryLedger} from '../../dist/packages/inventory/src/index.js';

const lot={id:'lot-1',specificationId:'spec-rice',quantity:{amount:100,unit:'kg'}};
const receipt={lot,ownerId:'supplier',custodianId:'club',placeId:'warehouse-1',receivedAt:'2026-09-07T10:00:00Z',receiptEvidenceIds:['ev-receipt']};
const obligation={id:'obl-1',specificationId:'spec-rice',quantity:{amount:60,unit:'kg'},state:'OPEN'};
const accepted={id:'qa-1',lotId:'lot-1',state:'ACCEPTED',assessedAt:'2026-09-07T10:05:00Z',evidenceIds:['ev-qa']};
const allocation=(id,amount,obligationId='obl-1')=>({id,lotId:'lot-1',obligationId,specificationId:'spec-rice',quantity:{amount,unit:'kg'},allocatedAt:'2026-09-07T10:10:00Z',evidenceIds:['ev-allocation']});

test('INV-008 received physical stock has a traceable lot and receipt evidence',()=>{
 const l=new InMemoryInventoryLedger(); const r=l.receiveLot(receipt); assert.equal(r.lot.id,'lot-1'); assert.equal(r.receiptEvidenceIds.length,1);
});

test('INV-009 quality is governed evidence-backed state, not a mutable lot scalar',()=>{
 const l=new InMemoryInventoryLedger(); l.receiveLot(receipt); l.assessQuality(accepted);
 assert.throws(()=>l.assessQuality({...accepted,id:'qa-2',state:'QUARANTINED'}),/QUALITY_CORRECTION_LINEAGE_REQUIRED/);
 l.assessQuality({...accepted,id:'qa-2',state:'QUARANTINED',supersedes:'qa-1',evidenceIds:['ev-qa-2']}); assert.equal(l.currentQuality('lot-1').state,'QUARANTINED');
});

test('INV-007 allocation cannot make lot availability negative',()=>{
 const l=new InMemoryInventoryLedger(); l.receiveLot(receipt); l.assessQuality(accepted); l.allocate(allocation('a1',60),obligation);
 assert.throws(()=>l.allocate(allocation('a2',50),{...obligation,id:'obl-2',quantity:{amount:60,unit:'kg'}}),/LOT_OVERALLOCATION/); assert.equal(l.availableForLot('lot-1').amount,40);
});

test('INV-010 allocation cannot exceed the open obligation',()=>{
 const l=new InMemoryInventoryLedger(); l.receiveLot(receipt); l.assessQuality(accepted); l.allocate(allocation('a1',40),obligation);
 assert.throws(()=>l.allocate(allocation('a2',30),obligation),/OBLIGATION_OVERALLOCATION/);
});

test('C5 quarantined or rejected lots cannot be allocated',()=>{
 const l=new InMemoryInventoryLedger(); l.receiveLot(receipt); l.assessQuality({...accepted,state:'QUARANTINED'}); assert.throws(()=>l.allocate(allocation('a1',10),obligation),/LOT_NOT_ALLOCATABLE/);
});

test('C5 specification mismatch cannot be hidden by allocation',()=>{
 const l=new InMemoryInventoryLedger(); l.receiveLot(receipt); l.assessQuality(accepted); assert.throws(()=>l.allocate({...allocation('a1',10),specificationId:'spec-maize'},obligation),/ALLOCATION_SPECIFICATION_MISMATCH/);
});
