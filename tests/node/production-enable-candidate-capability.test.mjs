import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflows = [
  '.github/workflows/production-access-v2-recovery.yml',
  '.github/workflows/production-application-access-activation.yml',
];

test('every Production enable ceremony proves exact-SHA runtime enforcement before mutation', async () => {
  for (const path of workflows) {
    const source = await readFile(path, 'utf8');
    const capabilityGate = source.indexOf('GOVERNED_CANDIDATE_LACKS_EXACT_SHA_ENFORCEMENT');
    const mismatchExpectation = source.indexOf("mismatch?.error !== 'PRODUCTION_APPLICATION_ACCESS_SHA_UNVERIFIED'");
    const firstMutation = Math.min(
      ...[
        source.indexOf('vercel deploy --prebuilt --prod'),
        source.indexOf('/env?teamId='),
      ].filter((index) => index >= 0),
    );
    assert.ok(capabilityGate >= 0, `${path} lacks candidate capability gate`);
    assert.ok(mismatchExpectation >= 0, `${path} does not require exact mismatch denial`);
    assert.ok(firstMutation >= 0, `${path} lacks a detectable Production mutation`);
    assert.ok(capabilityGate < firstMutation, `${path} mutates Production before candidate capability proof`);
  }
});

test('activation evidence keeps payment and fulfillment mutation authority withheld', async () => {
  const source = await readFile('.github/workflows/production-application-access-activation.yml', 'utf8');
  assert.match(
    source,
    /paymentMutationWithheld': exclusions\.get\('paymentOrFulfillmentMutationAuthorityGranted'\) is False/,
  );
});
