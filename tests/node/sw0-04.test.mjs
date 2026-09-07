import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,money,quantity} from '../../dist/packages/kernel/src/index.js';
import {FoundingWorkerEligibilityPolicy,InMemoryMembershipStore} from '../../dist/packages/membership/src/index.js';
import {InMemoryCatalog,priceObservation} from '../../dist/packages/catalog/src/index.js';

const pid=x=>asId(x), sid=x=>asId(x), eid=x=>asId(x), oid=x=>asId(x);

test('SW0-04 eligibility does not itself create membership',()=>{
 const p=pid('participant:member-1');
 const evidence=eid('evidence:employment-1');
 const policy=new FoundingWorkerEligibilityPolicy();
 const decision=policy.evaluate({participantId:p,evidenceIds:[evidence],at:'2026-09-07T10:00:00Z',attributes:{workerClass:'PUBLIC_SECTOR',verified:true}});
 assert.equal(decision.eligible,true);
 const store=new InMemoryMembershipStore();
 assert.equal(store.byParticipant(p).length,0);
 store.establish({id:'membership:1',participantId:p,decision,at:'2026-09-07T10:01:00Z'});
 assert.equal(store.byParticipant(p).length,1);
});

test('SW0-04 membership requires qualifying evidence, not cohort label alone',()=>{
 const p=pid('participant:member-2');
 const policy=new FoundingWorkerEligibilityPolicy();
 const decision=policy.evaluate({participantId:p,evidenceIds:[],at:'2026-09-07T10:00:00Z',attributes:{workerClass:'PUBLIC_SECTOR',verified:false}});
 assert.equal(decision.eligible,false);
 assert.throws(()=>new InMemoryMembershipStore().establish({id:'membership:2',participantId:p,decision,at:'2026-09-07T10:01:00Z'}),/MEMBERSHIP_REQUIRES_ELIGIBILITY/);
});

test('SW0-04 SKU is a listing identifier and cannot replace specification identity',()=>{
 const c=new InMemoryCatalog();
 const spec=sid('spec:rice-5kg');
 c.publishSpecification({id:spec,version:1,name:'Rice 5 kg',baseUnit:'kg'});
 c.publishListing({listingId:'listing:1',sku:'RICE-5KG-A',specificationId:spec,displayName:'Rice 5 kg',active:true});
 c.publishListing({listingId:'listing:1b',sku:'PROMO-RICE-5KG',specificationId:spec,displayName:'Rice 5 kg Promo',active:true});
 assert.equal(c.getListing('listing:1').specificationId,spec);
 assert.equal(c.getListing('listing:1b').specificationId,spec);
});

test('SW0-04 price observation is contextual evidence, not a context-free scalar',()=>{
 const c=new InMemoryCatalog();
 const spec=sid('spec:rice-5kg');
 c.publishSpecification({id:spec,version:1,name:'Rice 5 kg',baseUnit:'kg'});
 const obs=priceObservation({evidenceId:eid('evidence:price-1'),specificationId:spec,price:money(12500n,'GHS'),basis:quantity(5,'kg'),place:'Accra Central Retail',observedAt:'2026-09-07T09:00:00Z',transactionLevel:'RETAIL',conditions:['cash price']});
 c.recordPriceObservation(obs);
 assert.throws(()=>priceObservation({...obs,evidenceId:eid('evidence:price-bad'),place:''}),/PRICE_PLACE_REQUIRED/);
});

test('SW0-04 member offer is bounded and must retain price-evidence lineage',()=>{
 const c=new InMemoryCatalog();
 const spec=sid('spec:rice-5kg');
 const priceEvidence=eid('evidence:price-2');
 c.publishSpecification({id:spec,version:1,name:'Rice 5 kg',baseUnit:'kg'});
 c.recordPriceObservation({evidenceId:priceEvidence,specificationId:spec,price:money(12500n,'GHS'),basis:quantity(5,'kg'),place:'Accra Central Retail',observedAt:'2026-09-07T09:00:00Z',transactionLevel:'RETAIL',conditions:[]});
 const offer=oid('offer:rice-1');
 c.publishMemberOffer({id:offer,offerorId:pid('participant:food-club'),specificationId:spec,quantity:quantity(5,'kg'),memberPrice:money(11000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'Hospital Pickup A',validFrom:'2026-09-07T10:00:00Z',validUntil:'2026-09-08T10:00:00Z',priceEvidenceIds:[priceEvidence],policyVersions:['member-price-v1']});
 assert.equal(c.isOfferExecutable(offer,'2026-09-07T12:00:00Z'),true);
 assert.equal(c.isOfferExecutable(offer,'2026-09-09T12:00:00Z'),false);
 assert.deepEqual(c.getOffer(offer).priceEvidenceIds,[priceEvidence]);
});

test('SW0-04 offer cannot use price evidence for a different specification',()=>{
 const c=new InMemoryCatalog();
 const rice=sid('spec:rice-5kg'), oil=sid('spec:oil-1l');
 c.publishSpecification({id:rice,version:1,name:'Rice 5 kg',baseUnit:'kg'});
 c.publishSpecification({id:oil,version:1,name:'Oil 1 L',baseUnit:'l'});
 const evidence=eid('evidence:oil-price');
 c.recordPriceObservation({evidenceId:evidence,specificationId:oil,price:money(5000n,'GHS'),basis:quantity(1,'l'),place:'Accra Retail',observedAt:'2026-09-07T09:00:00Z',transactionLevel:'RETAIL',conditions:[]});
 assert.throws(()=>c.publishMemberOffer({id:oid('offer:bad'),offerorId:pid('participant:food-club'),specificationId:rice,quantity:quantity(5,'kg'),memberPrice:money(10000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'Pickup A',validFrom:'2026-09-07T10:00:00Z',validUntil:'2026-09-08T10:00:00Z',priceEvidenceIds:[evidence],policyVersions:['member-price-v1']}),/OFFER_PRICE_EVIDENCE_SPEC_MISMATCH/);
});
