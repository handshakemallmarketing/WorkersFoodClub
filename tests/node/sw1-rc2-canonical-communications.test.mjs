import test from 'node:test';
import assert from 'node:assert/strict';
import {communicationEventFromCanonical} from '../../dist/packages/communications/src/canonical.js';

const ctx={memberId:'preview:member:001',orderLabel:'#1001'};
const event=(eventType,payload={})=>({eventId:`event:${eventType}`,aggregateId:'preview:obligation:11111111-1111-4111-8111-111111111111',eventType,occurredAt:'2026-09-11T23:30:00Z',payload});

test('canonical payment confirmation projects exact amount and provider reference',()=>{
  const out=communicationEventFromCanonical(event('PAYMENT_CONFIRMED',{amount:{minor:100,currency:'GHS'},providerReference:'wfc-rc2-ref'}),ctx);
  assert.equal(out?.type,'PAYMENT_CONFIRMED');assert.equal(out?.memberId,ctx.memberId);assert.equal(out?.data.amount,'GHS 1.00');assert.equal(out?.data.reference,'wfc-rc2-ref');
});

test('canonical refund completion projects only from completed remedy evidence',()=>{
  const out=communicationEventFromCanonical(event('REMEDY_COMPLETED',{amount:{minor:100,currency:'GHS'},providerReference:'refund:18241804'}),ctx);
  assert.equal(out?.type,'REFUND_COMPLETED');assert.equal(out?.data.amount,'GHS 1.00');assert.equal(out?.data.reference,'refund:18241804');
});

test('provider-like unknown events cannot manufacture member communication truth',()=>{
  assert.equal(communicationEventFromCanonical(event('PAYSTACK_WEBHOOK_CHARGE_SUCCESS',{amount:{minor:100,currency:'GHS'},providerReference:'x'}),ctx),undefined);
});

test('incomplete financial evidence fails closed',()=>{
  assert.throws(()=>communicationEventFromCanonical(event('PAYMENT_CONFIRMED',{providerReference:'x'}),ctx),/COMMUNICATION_PAYMENT_EVIDENCE_INCOMPLETE/);
  assert.throws(()=>communicationEventFromCanonical(event('REMEDY_COMPLETED',{amount:{minor:100,currency:'GHS'}}),ctx),/COMMUNICATION_REFUND_EVIDENCE_INCOMPLETE/);
});
