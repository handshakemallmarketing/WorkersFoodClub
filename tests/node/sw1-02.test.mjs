import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,money,quantity} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {InMemoryCatalog} from '../../dist/packages/catalog/src/index.js';
import {GovernedPilotCatalogService} from '../../dist/packages/pilot-catalog/src/index.js';

const pid=x=>asId(x), gid=x=>asId(x), sid=x=>asId(x), eid=x=>asId(x), oid=x=>asId(x);
const at='2026-09-08T12:00:00Z';
function fixture(actions=['catalog.specification.publish','catalog.listing.publish','catalog.price.observe','catalog.sales-window.publish','catalog.benchmark.publish','catalog.offer.publish']){
 const authorityStore=new InMemoryAuthorityStore();
 const actor=pid('participant:catalog-operator');
 authorityStore.put({id:gid('grant:catalog'),grantorId:pid('participant:food-club'),actorId:actor,actions,targetPrefix:'',validFrom:'2026-09-08T00:00:00Z'});
 return {actor,grant:gid('grant:catalog'),authorityStore,service:new GovernedPilotCatalogService(new AuthorityEvaluator(authorityStore),new InMemoryCatalog())};
}

function seed(f){
 const ctx={actorId:f.actor,grantIds:[f.grant],at};
 const spec=sid('spec:rice');
 f.service.publishSpecification(ctx,{id:spec,version:1,name:'Rice',baseUnit:'kg'});
 f.service.publishListing(ctx,{listingId:'listing:rice',sku:'RICE-5KG',specificationId:spec,displayName:'Rice 5 kg',active:true});
 const pe=eid('evidence:retail-rice');
 f.service.recordPriceObservation(ctx,{evidenceId:pe,specificationId:spec,price:money(60000n,'GHS'),basis:quantity(5,'kg'),place:'Accra Retail',observedAt:'2026-09-08T09:00:00Z',transactionLevel:'RETAIL',conditions:['cash']});
 f.service.createSalesWindow(ctx,{id:'window:sep',validFrom:'2026-09-08T10:00:00Z',validUntil:'2026-09-10T18:00:00Z',pickupPlace:'Hospital A',active:true,policyVersion:'sales-window-v1',createdBy:f.actor});
 f.service.defineBenchmarkDisplay(ctx,{id:'benchmark:rice',specificationId:spec,priceEvidenceId:pe,methodVersion:'retail-reference-v1'});
 return {ctx,spec,pe};
}

test('SW1-02 governed offer retains benchmark evidence and bounded sales window',()=>{
 const f=fixture(),{ctx,spec,pe}=seed(f);
 const offer=oid('offer:rice');
 f.service.publishOffer(ctx,{salesWindowId:'window:sep',benchmarkDisplayId:'benchmark:rice',offer:{id:offer,offerorId:pid('participant:food-club'),specificationId:spec,quantity:quantity(5,'kg'),memberPrice:money(50000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'Hospital A',validFrom:'2026-09-08T12:00:00Z',validUntil:'2026-09-10T12:00:00Z',priceEvidenceIds:[pe],policyVersions:['member-price-v1']}});
 const view=f.service.catalogView({listingId:'listing:rice',offerId:offer,benchmarkDisplayId:'benchmark:rice',at:'2026-09-09T12:00:00Z'});
 assert.equal(view.benchmark.disclaimer,'REFERENCE_ONLY_NOT_FINAL_SAVINGS');
 assert.equal(view.benchmark.value.minor,60000n);
});

test('SW1-02 UI/catalog access cannot substitute for catalog authority',()=>{
 const f=fixture([]),ctx={actorId:f.actor,grantIds:[f.grant],at};
 assert.throws(()=>f.service.publishSpecification(ctx,{id:sid('spec:rice'),version:1,name:'Rice',baseUnit:'kg'}),/CATALOG_UNAUTHORIZED:ACTION_OUT_OF_SCOPE/);
});

test('SW1-02 revoked publication authority fails closed',()=>{
 const f=fixture();f.authorityStore.revoke(f.grant,'2026-09-08T11:00:00Z');
 assert.throws(()=>f.service.publishSpecification({actorId:f.actor,grantIds:[f.grant],at},{id:sid('spec:rice'),version:1,name:'Rice',baseUnit:'kg'}),/CATALOG_UNAUTHORIZED:REVOKED/);
});

test('SW1-02 offer cannot escape governed sales window or pickup place',()=>{
 const f=fixture(),{ctx,spec,pe}=seed(f);
 const base={id:oid('offer:bad'),offerorId:pid('participant:food-club'),specificationId:spec,quantity:quantity(5,'kg'),memberPrice:money(50000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'Hospital A',validFrom:'2026-09-08T12:00:00Z',validUntil:'2026-09-11T12:00:00Z',priceEvidenceIds:[pe],policyVersions:['member-price-v1']};
 assert.throws(()=>f.service.publishOffer(ctx,{offer:base,salesWindowId:'window:sep',benchmarkDisplayId:'benchmark:rice'}),/OFFER_OUTSIDE_SALES_WINDOW/);
 assert.throws(()=>f.service.publishOffer(ctx,{offer:{...base,id:oid('offer:bad-place'),validUntil:'2026-09-09T12:00:00Z',pickupPlace:'Other Pickup'},salesWindowId:'window:sep',benchmarkDisplayId:'benchmark:rice'}),/OFFER_WINDOW_PLACE_MISMATCH/);
});

test('SW1-02 offer must retain the evidence used for displayed benchmark',()=>{
 const f=fixture(),{ctx,spec}=seed(f);
 assert.throws(()=>f.service.publishOffer(ctx,{salesWindowId:'window:sep',benchmarkDisplayId:'benchmark:rice',offer:{id:oid('offer:no-benchmark-lineage'),offerorId:pid('participant:food-club'),specificationId:spec,quantity:quantity(5,'kg'),memberPrice:money(50000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'Hospital A',validFrom:'2026-09-08T12:00:00Z',validUntil:'2026-09-09T12:00:00Z',priceEvidenceIds:[eid('evidence:other')],policyVersions:['member-price-v1']}}),/OFFER_BENCHMARK_EVIDENCE_NOT_RETAINED|OFFER_PRICE_EVIDENCE_UNKNOWN/);
});
