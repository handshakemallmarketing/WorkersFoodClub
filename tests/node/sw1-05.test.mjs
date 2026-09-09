import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {ExplicitPhysicalLineageLedger} from '../../dist/packages/lineage/src/index.js';
import {InMemoryInventoryLedger} from '../../dist/packages/inventory/src/index.js';
import {InMemoryDemandCommitmentLedger} from '../../dist/packages/demand/src/index.js';
import {GovernedPilotInventoryService} from '../../dist/packages/pilot-inventory/src/index.js';

const pid=x=>asId(x), lot=x=>asId(x), spec=x=>asId(x), oid=x=>asId(x), eid=x=>asId(x), gid=x=>asId(x), off=x=>asId(x), cmd=x=>asId(x);
const at='2026-09-08T18:00:00Z';
const rice=spec('spec:rice');
const member=pid('participant:member');
const club=pid('participant:club');

function setup({maxQuantity}={}){
 const actor=pid('participant:warehouse-1'); const authStore=new InMemoryAuthorityStore(); const grant=gid('grant:inventory-1');
 authStore.put({id:grant,grantorId:club,actorId:actor,actions:['inventory.receive','inventory.quality.assess','inventory.transform','inventory.receive-derived','inventory.allocate'],targetPrefix:'lot:',validFrom:'2026-09-08T00:00:00Z',...(maxQuantity===undefined?{}:{maxQuantity})});
 const demand=new InMemoryDemandCommitmentLedger({isAccepted:async()=>true});
 return {actor,grant,demand,service:new GovernedPilotInventoryService(new AuthorityEvaluator(authStore),new InMemoryInventoryLedger(),new ExplicitPhysicalLineageLedger(),demand)};
}

async function addObligation(demand,id,amount){
 const offer={id:off(`offer:${id}`),offerorId:club,specificationId:rice,quantity:quantity(amount,'kg'),memberPrice:money(BigInt(amount*1000),'GHS'),priceBasis:quantity(amount,'kg'),pickupPlace:'Pickup A',validFrom:'2026-09-08T00:00:00Z',validUntil:'2026-09-09T00:00:00Z',priceEvidenceIds:[eid(`e:price:${id}`)],policyVersions:['price-v1']};
 return demand.commitPurchase({obligationId:oid(id),participantId:member,membership:{id:'membership:1',participantId:member,state:'ACTIVE',establishedAt:'2026-09-08T00:00:00Z',eligibilityPolicyVersion:'v1',eligibilityEvidenceIds:[eid('e:elig')]},offer,quantity:quantity(amount,'kg'),authorizedCommandId:cmd(`command:${id}`),authorizedEventId:`event:${id}`,acceptedAt:at,policyVersions:['checkout-v1']});
}

const receipt=(id,actor,amount=10)=>({lot:{id:lot(id),specificationId:rice,quantity:quantity(amount,'kg')},ownerId:club,custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid(`e:receipt:${id}`)]});

test('SW1-05 receiving requires authority, bounded quantity, and operator custody',()=>{
 const {actor,grant,service}=setup({maxQuantity:5});
 assert.throws(()=>service.receiveLot({actorId:actor,grantIds:[],at},receipt('lot:no-auth',actor,5)),/INVENTORY_UNAUTHORIZED:NO_GRANT/);
 assert.throws(()=>service.receiveLot({actorId:actor,grantIds:[grant],at},{...receipt('lot:wrong-custody',actor,5),custodianId:pid('participant:other')}),/LOT_CUSTODIAN_ACTOR_MISMATCH/);
 service.receiveLot({actorId:actor,grantIds:[grant],at},receipt('lot:bounded',actor,5));
 assert.throws(()=>service.receiveLot({actorId:actor,grantIds:[grant],at},receipt('lot:too-large',actor,6)),/INVENTORY_UNAUTHORIZED:LIMIT_EXCEEDED/);
});

test('SW1-05 unsafe stock reports zero availability; future quality cannot unlock it',async()=>{
 const {actor,grant,demand,service}=setup(); const bulk=lot('lot:quality');
 service.receiveLot({actorId:actor,grantIds:[grant],at},receipt(String(bulk),actor,10));
 assert.equal(service.availability(bulk).amount,0);
 assert.throws(()=>service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:future',lotId:bulk,state:'ACCEPTED',assessedAt:'2026-09-08T19:00:00Z',evidenceIds:[eid('e:qf')]}),/QUALITY_ASSESSMENT_FROM_FUTURE/);
 service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:ok',lotId:bulk,state:'ACCEPTED',assessedAt:at,evidenceIds:[eid('e:q1')]});
 assert.equal(service.availability(bulk).amount,10);
 await addObligation(demand,'obligation:1',5);
 const alloc={id:'allocation:1',lotId:bulk,obligationId:oid('obligation:1'),specificationId:rice,quantity:quantity(5,'kg'),allocatedAt:at,evidenceIds:[eid('e:a1')]};
 service.allocate({actorId:actor,grantIds:[grant],at},{allocation:alloc});
 assert.equal(service.availability(bulk).amount,5);
 assert.throws(()=>service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{...alloc,id:'allocation:unknown',obligationId:oid('obligation:missing')}}),/ALLOCATION_OBLIGATION_UNKNOWN/);
 await addObligation(demand,'obligation:2',6);
 assert.throws(()=>service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{...alloc,id:'allocation:2',obligationId:oid('obligation:2'),quantity:quantity(6,'kg')}}),/LOT_OVERALLOCATION/);
});

test('SW1-05 transform debits source availability and prevents physical double allocation',async()=>{
 const {actor,grant,demand,service}=setup(); const source=lot('lot:source'), pack=lot('lot:pack');
 service.receiveLot({actorId:actor,grantIds:[grant],at},receipt(String(source),actor,10));
 service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:source',lotId:source,state:'ACCEPTED',assessedAt:at,evidenceIds:[eid('e:qs')]});
 service.transform({actorId:actor,grantIds:[grant],at},{id:'transform:1',kind:'REPACK',inputs:[{lotId:String(source),quantity:quantity(5,'kg')}],outputs:[{lotId:String(pack),quantity:quantity(5,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:at,evidenceIds:[eid('e:t1')]});
 assert.equal(service.availability(source).amount,5);
 service.receiveDerivedLot({actorId:actor,grantIds:[grant],at},{lot:{id:pack,specificationId:rice,quantity:quantity(5,'kg')},ownerId:club,custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid('e:derived')]});
 service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:pack',lotId:pack,state:'ACCEPTED',assessedAt:at,evidenceIds:[eid('e:qp')]});
 await addObligation(demand,'obligation:source',5); await addObligation(demand,'obligation:pack',5); await addObligation(demand,'obligation:extra',1);
 service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{id:'allocation:source',lotId:source,obligationId:oid('obligation:source'),specificationId:rice,quantity:quantity(5,'kg'),allocatedAt:at,evidenceIds:[eid('e:as')]}});
 service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{id:'allocation:pack',lotId:pack,obligationId:oid('obligation:pack'),specificationId:rice,quantity:quantity(5,'kg'),allocatedAt:at,evidenceIds:[eid('e:ap')]}});
 assert.equal(service.availability(source).amount,0); assert.equal(service.availability(pack).amount,0);
 assert.throws(()=>service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{id:'allocation:extra',lotId:source,obligationId:oid('obligation:extra'),specificationId:rice,quantity:quantity(1,'kg'),allocatedAt:at,evidenceIds:[eid('e:ax')]}}),/LOT_OVERALLOCATION/);
});

test('SW1-05 failed source receipt on a derived lineage ID leaves no ghost inventory receipt',()=>{
 const {actor,grant,service}=setup(); const source=lot('lot:atomic-source'), derived=lot('lot:atomic-derived');
 service.receiveLot({actorId:actor,grantIds:[grant],at},receipt(String(source),actor,10));
 service.transform({actorId:actor,grantIds:[grant],at},{id:'transform:atomic',kind:'REPACK',inputs:[{lotId:String(source),quantity:quantity(5,'kg')}],outputs:[{lotId:String(derived),quantity:quantity(5,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:at,evidenceIds:[eid('e:ta')]});
 assert.throws(()=>service.receiveLot({actorId:actor,grantIds:[grant],at},receipt(String(derived),actor,99)),/LINEAGE_LOT_INVALID/);
 assert.throws(()=>service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:ghost',lotId:derived,state:'ACCEPTED',assessedAt:at,evidenceIds:[eid('e:qg')]}),/QUALITY_LOT_UNKNOWN/);
});

test('SW1-05 allocation authority is scoped to the affected lot, not caller-controlled allocation id',async()=>{
 const {actor,grant,demand,service}=setup({maxQuantity:5}); const bulk=lot('lot:scoped');
 service.receiveLot({actorId:actor,grantIds:[grant],at},receipt(String(bulk),actor,5));
 service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:scoped',lotId:bulk,state:'ACCEPTED',assessedAt:at,evidenceIds:[eid('e:scoped-q')]});
 await addObligation(demand,'obligation:scoped',5);
 service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{id:'evil-unrelated-id',lotId:bulk,obligationId:oid('obligation:scoped'),specificationId:rice,quantity:quantity(5,'kg'),allocatedAt:at,evidenceIds:[eid('e:scoped-a')]}});
 assert.equal(service.availability(bulk).amount,0);
});
