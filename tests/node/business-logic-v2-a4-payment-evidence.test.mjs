import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryMembershipBillingStore} from '../../dist/packages/membership/src/billing.js';
import {InMemoryShoppingCreditStore} from '../../dist/packages/membership/src/credits.js';

const at='2026-09-16T12:00:00Z';
const member='participant:a4-member';
const invoiceId='invoice:a4-membership';
const proof=(overrides={})=>({evidenceId:'evidence:a4-payment-1',providerReference:'provider:a4-payment-1',participantId:member,obligationId:invoiceId,amountMinor:10000,verified:true,persisted:true,verifiedAt:at,...overrides});
const store=credits=>{const billing=new InMemoryMembershipBillingStore(credits);billing.issue({id:invoiceId,participantId:member,amountMinor:10000,issuedAt:'2026-09-01T00:00:00Z',dueAt:'2026-09-10T00:00:00Z'});return billing;};

test('A4 arbitrary caller reference cannot masquerade as authoritative payment evidence',()=>{const billing=store();assert.throws(()=>billing.recordAuthoritativeSettlement(invoiceId,{amountMinor:10000,reference:'caller-assertion'}),/VERIFIED_PERSISTED_PAYMENT_EVIDENCE_REQUIRED/);assert.equal(billing.get(invoiceId).settledMinor,0);});
test('A4 empty durable evidence identity or provider reference is rejected',()=>{const billing=store();assert.throws(()=>billing.recordAuthoritativeSettlement(invoiceId,proof({evidenceId:' '})),/PAYMENT_EVIDENCE_IDENTITY_REQUIRED/);assert.throws(()=>billing.recordAuthoritativeSettlement(invoiceId,proof({providerReference:' '})),/PAYMENT_EVIDENCE_IDENTITY_REQUIRED/);});
test('A4 insufficient verified amount cannot settle annual membership',()=>{const billing=store();assert.throws(()=>billing.recordAuthoritativeSettlement(invoiceId,proof({amountMinor:9999})),/ANNUAL_MEMBERSHIP_FEE_FULL_PAYMENT_REQUIRED/);assert.equal(billing.get(invoiceId).state,'ISSUED');});
test('A4 verified overpayment settles fee once and creates shipping-only credit from excess',()=>{const credits=new InMemoryShoppingCreditStore();const billing=store(credits);const evidence=proof({amountMinor:12500});const first=billing.recordAuthoritativeSettlement(invoiceId,evidence);const replay=billing.recordAuthoritativeSettlement(invoiceId,evidence);assert.equal(first.invoice.settledMinor,10000);assert.equal(first.overpaymentShippingCreditMinor,2500);assert.equal(replay.overpaymentShippingCreditMinor,0);assert.equal(credits.balanceByApplicability(member,'SHIPPING'),2500);assert.equal(credits.balanceByApplicability(member,'MERCHANDISE'),0);});
