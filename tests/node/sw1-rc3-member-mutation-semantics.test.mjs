import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  new URL('../../api/commit-sandbox.js', import.meta.url),
  new URL('../../api/pay-sandbox.js', import.meta.url),
];

async function source(url) {
  return readFile(url, 'utf8');
}

test('RC3 member mutation routes retain production deny gates', async () => {
  const [commit, pay] = await Promise.all(files.map(source));
  assert.match(commit, /SANDBOX_COMMIT_DISABLED_IN_PRODUCTION/);
  assert.match(pay, /SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION/);
});

test('RC3 member mutation routes generate neutral durable IDs and runtime ownership', async () => {
  const [commit, pay] = await Promise.all(files.map(source));

  for (const text of [commit, pay]) {
    assert.match(text, /durableId\('command'\)/);
    assert.match(text, /durableId\('event'\)/);
    assert.match(text, /runtimeOwnerToken\(runtime\.environment\)/);
    assert.doesNotMatch(text, /`preview:command:\$\{randomUUID\(\)\}`/);
    assert.doesNotMatch(text, /`preview:event:\$\{randomUUID\(\)\}`/);
    assert.doesNotMatch(text, /'vercel-preview'/);
    assert.doesNotMatch(text, /'environment',\s*'preview'/);
  }

  assert.match(commit, /durableId\('obligation'\)/);
  assert.match(pay, /durableId\('payment'\)/);
});

test('RC3 member mutation canonical records bind to authenticated actor', async () => {
  const [commit, pay] = await Promise.all(files.map(source));

  for (const text of [commit, pay]) {
    assert.match(text, /requireApplicationAuth/);
    assert.match(text, /canonicalRuntimeMetadata\(\{ principal, environment: runtimeEnvironment\(\) \}\)/);
    assert.match(text, /\$\{runtime\.actorId\}/);
    assert.match(text, /'actorId'/);
    assert.match(text, /'environment', \$\{runtime\.environment\}/);
  }

  assert.doesNotMatch(commit, /SELECT \$\{obligationId\}, \$\{requestId\}, \$\{PREVIEW_PARTICIPANT_ID\}/);
  assert.doesNotMatch(pay, /participant_id = \$\{PREVIEW_PARTICIPANT_ID\}/);
});

test('RC3 sandbox payment accepts neutral and legacy obligation identifiers', async () => {
  const pay = await source(files[1]);
  assert.match(pay, /preview:obligation:/);
  assert.match(pay, /wfc:obligation:/);
});
