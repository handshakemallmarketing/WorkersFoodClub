import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { requireProductionApplicationAccess } from '../../lib/production-access-policy.js';

const workflows = [
  '.github/workflows/production-access-v2-recovery.yml',
  '.github/workflows/production-application-access-activation.yml',
];

test('every Production enable ceremony proves exact-SHA runtime enforcement before mutation', async () => {
  for (const path of workflows) {
    const source = await readFile(path, 'utf8');
    const capabilityGate = source.indexOf('GOVERNED_CANDIDATE_LACKS_EXACT_SHA_ENFORCEMENT');
    const mismatchExpectation = source.indexOf("mismatch?.error !== 'PRODUCTION_APPLICATION_ACCESS_SHA_UNAUTHORIZED'");
    const mutationIndexes = [
      source.indexOf('vercel deploy --prebuilt --prod'),
      source.indexOf('/env?teamId='),
    ].filter((index) => index >= 0);
    assert.ok(capabilityGate >= 0, `${path} lacks candidate capability gate`);
    assert.ok(mismatchExpectation >= 0, `${path} does not require valid-SHA mismatch denial`);
    assert.match(source, /VERCEL: '1'/, `${path} does not exercise the hosted Vercel boundary`);
    assert.match(source, /VERCEL_ENV: 'production'/, `${path} does not exercise the Production boundary`);
    assert.ok(mutationIndexes.length > 0, `${path} lacks a detectable Production mutation`);
    assert.ok(
      capabilityGate < Math.min(...mutationIndexes),
      `${path} mutates Production before candidate capability proof`,
    );
  }
});

test('activation evidence keeps payment and fulfillment mutation authority withheld', async () => {
  const source = await readFile('.github/workflows/production-application-access-activation.yml', 'utf8');
  assert.match(
    source,
    /paymentMutationWithheld': exclusions\.get\('paymentOrFulfillmentMutationAuthorityGranted'\) is False/,
  );
});

test('an enforcement-capable candidate passes the exact hosted-Production contract', () => {
  const expected = '1111111111111111111111111111111111111111';
  const common = {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
    PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA: expected,
  };
  assert.deepEqual(
    requireProductionApplicationAccess({
      ...common,
      VERCEL_GIT_COMMIT_SHA: '0000000000000000000000000000000000000000',
    }),
    {
      ok: false,
      status: 503,
      error: 'PRODUCTION_APPLICATION_ACCESS_SHA_UNAUTHORIZED',
    },
  );
  assert.deepEqual(
    requireProductionApplicationAccess({
      ...common,
      VERCEL_GIT_COMMIT_SHA: expected,
    }),
    { ok: true },
  );
});
