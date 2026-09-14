import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalRuntimeMetadata,
  durableId,
  runtimeEnvironment,
  runtimeOwnerToken,
} from '../../lib/durable-runtime-semantics.js';

test('RC3 durable IDs are environment-neutral', () => {
  const uuid = '11111111-2222-4333-8444-555555555555';
  assert.equal(durableId('event', uuid), `wfc:event:${uuid}`);
  assert.equal(durableId('command', uuid), `wfc:command:${uuid}`);
  assert.equal(durableId('fulfillment', uuid), `wfc:fulfillment:${uuid}`);
  assert.equal(durableId('event', uuid).includes('preview'), false);
  assert.equal(durableId('event', uuid).includes('production'), false);
});

test('RC3 runtime environment is metadata, not identity namespace', () => {
  assert.equal(runtimeEnvironment({ VERCEL_ENV: 'production' }), 'production');
  assert.equal(runtimeEnvironment({ VERCEL_ENV: 'preview' }), 'preview');
  assert.equal(runtimeEnvironment({}), 'local');
  assert.equal(runtimeOwnerToken('production'), 'wfc-runtime:production');
  assert.equal(runtimeOwnerToken('preview'), 'wfc-runtime:preview');
});

test('RC3 canonical metadata requires authenticated actor', () => {
  assert.throws(() => canonicalRuntimeMetadata(), /CANONICAL_ACTOR_REQUIRED/);
  assert.deepEqual(
    canonicalRuntimeMetadata({ principal: { actorId: 'operator:001' }, environment: 'production' }),
    { actorId: 'operator:001', environment: 'production' },
  );
});

test('RC3 rejects invalid durable ID kinds and runtime environments', () => {
  assert.throws(() => durableId('Preview Event'), /DURABLE_ID_KIND_INVALID/);
  assert.throws(() => runtimeOwnerToken('staging-ish'), /RUNTIME_ENVIRONMENT_INVALID/);
});
