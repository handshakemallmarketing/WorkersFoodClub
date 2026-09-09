import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {ExplicitPhysicalLineageLedger} from '../../dist/packages/lineage/src/index.js';
import {InMemoryInventoryLedger} from '../../dist/packages/inventory/src/index.js';
import {InMemoryDemandCommitmentLedger} from '../../dist/packages/demand/src/index.js';
import {GovernedPilotInventoryService} from '../../dist/packages/pilot-inventory/src/index.js';

const pid=x=>asId(x), lot=x=>asId(x), spec=x=>asId(x), oid=x=>asId(x), eid=x=>asId(x), gid=x=>asId(x), off=x=>asId(x), cmd=x=>asId(x);
const at='2026-09-09T12:00:00Z';
const rice=spec('spec:rice'); const member=pid('participant:member'); const club=pid('participant:club');

function setup(){
 const actor=pid('participant:warehouse-1'); const store=new InMemoryAuthorityStore(); const grant=gid('grant:inventory-remediation');
 store.put({id:grant,grantorId:club,actorId:actor,actions:['inventory.receive','inventory.quality.assess','inventory.transform','inventory.allocate'],targetPrefix:'lot:',validFrom:'2026-09-09T00:00:00Z'});
 const demand=new InMemoryDemandCommitmentLedger({isAccepted:async()=>true});
 const service=new GovernedPilotInventoryService(new AuthorityEvaluator(store),new InMemoryInventoryLedger(),new ExplicitPhysicalLineageLedger(),demand);
 return {actor,grant,demand,service};
}

async function addObligation(demand,id,amount){
 const offer={id:off(`offer:${id}`),offerorId:club,specificationId:rice,quantity:quantity(amount,'kg'),memberPrice:money(BigInt(amount*1000),'GHS'),priceBasis:quantity(amount,'kg'),pickupPlace:'Pickup A',validFrom:'2026-09-09T00:00:00Z',validUntil:'2026-09-10T00:00:00Z',priceEvidenceIds:[eid(`e:price:${id}`)],policyVersions:['price-v1']};
 return demand.commitPurchase({obligationId:oid(id),participantId:member,membership:{id:'membership:1',participantId:member,state:'ACTIVE',establishedAt:'2026-09-09T00:00:00Z',eligibilityPolicyVersion:'v1',eligibilityEvidenceIds:[eid('e:elig')]},offer,quantity:quantity(amount,'kg'),authorizedCommandId:cmd(`command:${id}`),authorizedEventId:`event:${id}`,acceptedAt:at,policyVersions:['checkout-v1']});
}

test('SW1-08B fully allocated quantity cannot also be consumed by transform',async()=>{
 const {actor,grant,demand,service}=setup(); const source=lot('lot:allocated-source'); const derived=lot('lot:derived');
 service.receiveLot({actorId:actor,grantIds:[grant],at},{lot:{id:source,specificationId:rice,quantity:quantity(10,'kg')},ownerId:club,custodianId:actor,placeId:'warehouse:A',receivedAt:at,receiptEvidenceIds:[eid('e:receipt')]});
 service.assessQuality({actorId:actor,grantIds:[grant],at},{id:'quality:accepted',lotId:source,state:'ACCEPTED',assessedAt:at,evidenceIds:[eid('e:quality')]});
 await addObligation(demand,'obligation:allocated',10);
 service.allocate({actorId:actor,grantIds:[grant],at},{allocation:{id:'allocation:all',lotId:source,obligationId:oid('obligation:allocated'),specificationId:rice,quantity:quantity(10,'kg'),allocatedAt:at,evidenceIds:[eid('e:allocation')]}});
 assert.equal(service.availability(source).amount,0);
 assert.throws(()=>service.transform({actorId:actor,grantIds:[grant],at},{id:'transform:must-fail',kind:'REPACK',inputs:[{lotId:String(source),quantity:quantity(10,'kg')}],outputs:[{lotId:String(derived),quantity:quantity(10,'kg')}],lossQuantity:quantity(0,'kg'),occurredAt:at,evidenceIds:[eid('e:transform')]}),/TRANSFORMATION_INPUT_EXCEEDS_AVAILABLE/);
 assert.equal(service.ancestry(source).filter(x=>x.direction==='INPUT').length,0);
});
