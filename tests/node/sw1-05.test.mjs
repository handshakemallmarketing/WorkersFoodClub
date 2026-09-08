import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {ExplicitPhysicalLineageLedger} from '../../dist/packages/lineage/src/index.js';
import {InMemoryInventoryLedger} from '../../dist/packages/inventory/src/index.js';
import {GovernedPilotInventoryService} from '../../dist/packages/pilot-inventory/src/index.js';

const pid=x=>asId(x), lot=x=>asId(x), spec=x=>asId(x), oid=x=>asId(x), eid=x=>asId(x), gid=x=>asId(x);
const at='2026-09-08T18:00:00Z';
function setup(actions=['inventory.receive','inventory.quality.assess','inventory.transform','inventory.receive-derived','inventory.allocate']){
 const actor=pid('participant:warehouse-1'); const authStore=new InMemoryAuthorityStore(); const grant=gid('grant:inventory-1');
 authStore.put({id:grant,grantorId:pid('participant:club'),actorId:actor,actions,targetPrefix:'',validFrom:'2026-09-08T00:00:00Z'});
 return {actor,grant,service:new GovernedPilotInventoryService(new AuthorityEvaluator(authStore),new InMemoryInventoryLedger(),new ExplicitPhysicalLineageLedger()),authStore};
}

test('SW1-05 receiving requires real authority and binds custodian to operator',()=>{
 const {actor,grant,service}=setup(); const rice=spec('spec:rice'); const bulk=lot('lot:bulk');
 const receipt={lot:{id:bulk,specificationId:rice,quantity:quantity(10,'kg')},ownerId:pid('participant:club'),custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid('e:receipt')]};
 assert.throws(()=>service.receiveLot({actorId:actor,grantIds:[],at},receipt),/INVENTORY_UNAUTHORIZED/);
 assert.throws(()=>service.receiveLot({actorId:actor,grantIds:[grant],at},{...receipt,custodianId:pid('participant:other')}),/LOT_CUSTODIAN_ACTOR_MISMATCH/);
 service.receiveLot({actorId:actor,grantIds:[grant],at},receipt);
});

test('SW1-05 unsafe lot cannot allocate; accepted lot can allocate only within bounds',()=>{
 const {actor,grant,service}=setup(); const rice=spec('spec:rice'); const bulk=lot('lot:bulk2');
 service.receiveLot({actorId:actor,grantIds:[grant],at},{lot:{id:bulk,specificationId:rice,quantity:quantity(10,'kg')},ownerId:pid('participant:club'),custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid('e:r2')]});
 const obligation={id:oid('obligation:1'),specificationId:rice,quantity:quantity(5,'kg'),state:'OPEN'};
 const alloc={id:'allocation:1',lotId:bulk,obligationId:obligation.id,specificationId:rice,quantity:quantity(5,'kg'),allocatedAt:at,evidenceIds:[eid('e:a1')]};
 assert.throws(()=>service.allocate({actorId:actor,grantIds:[grant],at},{allocation:alloc,obligation}),/LOT_NOT_ALLOCATABLE/);
 service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:1',lotId:bulk,state:'ACCEPTED',assessedAt:at,evidenceIds:[eid('e:q1')]});
 service.allocate({actorId:actor,grantIds:[grant],at},{allocation:alloc,obligation});
 assert.equal(service.availability(bulk).amount,5);
 assert.throws(()=>service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{...alloc,id:'allocation:2',quantity:quantity(6,'kg')},obligation:{...obligation,id:oid('obligation:2'),quantity:quantity(6,'kg')}}),/LOT_OVERALLOCATION/);
});

test('SW1-05 explicit repack lineage conserves quantity and derived lot must match lineage',()=>{
 const {actor,grant,service}=setup(); const rice=spec('spec:rice'); const source=lot('lot:source'), pack=lot('lot:pack');
 service.receiveLot({actorId:actor,grantIds:[grant],at},{lot:{id:source,specificationId:rice,quantity:quantity(10,'kg')},ownerId:pid('participant:club'),custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid('e:r3')]});
 service.transform({actorId:actor,grantIds:[grant],at},{id:'transform:1',kind:'REPACK',inputs:[{lotId:String(source),quantity:quantity(5,'kg')}],outputs:[{lotId:String(pack),quantity:quantity(5,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:at,evidenceIds:[eid('e:t1')]});
 assert.throws(()=>service.receiveDerivedLot({actorId:actor,grantIds:[grant],at},{lot:{id:pack,specificationId:rice,quantity:quantity(4,'kg')},ownerId:pid('participant:club'),custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid('e:drbad')]}),/DERIVED_LOT_LINEAGE_QUANTITY_MISMATCH/);
 service.receiveDerivedLot({actorId:actor,grantIds:[grant],at},{lot:{id:pack,specificationId:rice,quantity:quantity(5,'kg')},ownerId:pid('participant:club'),custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid('e:dr1')]});
 assert.equal(service.ancestry(pack).some(x=>x.direction==='OUTPUT'),true);
});
