import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeDemandCommitment, pooledDemandQuantity } from '../../dist/packages/catalog/src/commitment.js';

const offer = {
  offerId: 'offer:rice:1', version: 3, skuId: 'sku:rice', state: 'OPEN',
  validFrom: '2026-09-01T00:00:00Z', validUntil: '2026-10-01T00:00:00Z',
  policy: { minQuantity: 5, maxQuantity: 20, quantityStep: 5 },
};
const basket = { basketId: 'basket:1', memberId: 'member:1', lines: [{ offerId: offer.offerId, offerVersion: 3, skuId: offer.skuId, quantity: 10 }] };
const request = { requestId: 'req:1', memberId: 'member:1', basketId: basket.basketId, offerId: offer.offerId, offerVersion: 3, quantity: 10 };
const now = '2026-09-16T12:00:00Z';

function decide(overrides = {}) {
  return authorizeDemandCommitment({ request, basket, offer, memberInGoodStanding: true, now, ...overrides });
}

test('basket alone contributes zero pooled demand', () => {
  assert.equal(pooledDemandQuantity([], offer.offerId), 0);
});

test('successful authoritative commitment contributes demand', () => {
  const result = decide();
  assert.equal(result.ok, true);
  assert.equal(pooledDemandQuantity([result.commitment], offer.offerId), 10);
});

test('stale offer version fails closed', () => {
  assert.deepEqual(decide({ request: { ...request, offerVersion: 2 } }), { ok: false, code: 'OFFER_VERSION_STALE' });
});

test('minimum, maximum and step are enforced', () => {
  assert.equal(decide({ request: { ...request, quantity: 4 } }).code, 'QUANTITY_BELOW_MINIMUM');
  assert.equal(decide({ request: { ...request, quantity: 25 } }).code, 'QUANTITY_ABOVE_MAXIMUM');
  const stepBasket = { ...basket, lines: [{ ...basket.lines[0], quantity: 7 }] };
  assert.equal(decide({ request: { ...request, quantity: 7 }, basket: stepBasket }).code, 'QUANTITY_STEP_INVALID');
});

test('member good standing is required', () => {
  assert.deepEqual(decide({ memberInGoodStanding: false }), { ok: false, code: 'MEMBER_NOT_IN_GOOD_STANDING' });
});

test('request replay returns the original commitment and cannot double count', () => {
  const first = decide();
  assert.equal(first.ok, true);
  const existing = new Map([[request.requestId, first.commitment]]);
  const replay = decide({ existingByRequestId: existing });
  assert.deepEqual(replay, first);
  assert.equal(pooledDemandQuantity([...existing.values()], offer.offerId), 10);
});
