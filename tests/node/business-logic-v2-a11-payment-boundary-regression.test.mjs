import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryMembershipBillingStore} from '../../dist/packages/membership/src/billing.js';
import {InMemoryShoppingCreditStore} from '../../dist/packages/membership/src/credits.js';
import {authorizeDemandCommitment,pooledDemandQuantity} from '../../dist/packages/catalog/src/commitment.js';

const now='2026-09-16T12:00:00Z';
const memberId='participant:a11-member';
const evidence=(obligationId,amountMinor,reference)=>({evidenceId:`evidence:${reference}`,providerReference:reference,participantId:memberId,obligationId,amountMinor,verified:true,persisted:true,verifiedAt:now});
const offer={offerId:'offer:a11-rice',version:1,skuId:'sku:rice',state:'OPEN',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-10-01T00:00:00Z',policy:{minQuantity:5,maxQuantity:20,quantityStep:5}};
const basket={basketId:'basket:a11',memberId,lines:[{offerId:offer.offerId,offerVersion:1,skuId:offer.skuId,quantity:10}]};
const request={requestId:'request:a11',memberId,basketId:basket.basketId,offerId:offer.offerId,offerVersion:1,quantity:10};

test('A11 verified annual settlement restores commerce eligibility',()=>{const billing=new InMemoryMembershipBillingStore();const invoiceId='invoice:a11-settle';billing.issue({id:invoiceId,participantId:memberId,amountMinor:10000,issuedAt:'2026-09-01T00:00:00Z',dueAt:'2026-09-10T00:00:00Z'});billing.markDue(invoiceId);billing.markPastDue(invoiceId,'2026-09-11T00:00:00Z');billing.recordAuthoritativeSettlement(invoiceId,evidence(invoiceId,10000,'settlement:a11'));const result=authorizeDemandCommitment({request,basket,offer,memberInGoodStanding:billing.standing(memberId,true).state==='CURRENT',now});assert.equal(result.ok,true);assert.equal(pooledDemandQuantity([result.commitment],offer.offerId),10);});
test('A11 verified membership overpayment remains shipping-only credit',()=>{const credits=new InMemoryShoppingCreditStore();const billing=new InMemoryMembershipBillingStore(credits);const invoiceId='invoice:a11-over';billing.issue({id:invoiceId,participantId:memberId,amountMinor:10000,issuedAt:'2026-09-01T00:00:00Z',dueAt:'2026-09-10T00:00:00Z'});billing.recordAuthoritativeSettlement(invoiceId,evidence(invoiceId,11000,'settlement:a11-over'));assert.equal(credits.balanceByApplicability(memberId,'MERCHANDISE'),0);assert.equal(credits.balanceByApplicability(memberId,'SHIPPING'),1000);});
