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

test('RC3 enabled commitment mutation generates neutral durable IDs and runtime ownership', async () => {
  const [commit] = await Promise.all(files.map(source));

  assert.match(commit, /durableId\('command'\)/);
  assert.match(commit, /durableId\('event'\)/);
  assert.match(commit, /runtimeOwnerToken\(runtime\.environment\)/);
  assert.match(commit, /durableId\('obligation'\)/);
  assert.doesNotMatch(commit, /`preview:command:\$\{randomUUID\(\)\}`/);
  assert.doesNotMatch(commit, /`preview:event:\$\{randomUUID\(\)\}`/);
  assert.doesNotMatch(commit, /'vercel-preview'/);
  assert.doesNotMatch(commit, /'environment',\s*'preview'/);
});

test('RC3 enabled commitment canonical records bind to authenticated actor', async () => {
  const [commit] = await Promise.all(files.map(source));

  assert.match(commit, /requireApplicationAuth/);
  assert.match(commit, /canonicalRuntimeMetadata\(\{\s*principal,\s*environment:\s*runtimeEnvironment\(\)\s*\}\)/);
  assert.match(commit, /\$\{runtime\.actorId\}/);
  assert.match(commit, /(?:'actorId'\s*,\s*\$\{runtime\.actorId\}|actorId\s*:\s*runtime\.actorId)/);
  assert.match(commit, /(?:'environment'\s*,\s*\$\{runtime\.environment\}|environment\s*:\s*runtime\.environment)/);
  assert.doesNotMatch(commit, /SELECT \$\{obligationId\}, \$\{requestId\}, \$\{PREVIEW_PARTICIPANT_ID\}/);
});

test('RC3 sandbox payment is unavailable before any durable mutation', async () => {
  const pay = await source(files[1]);

  assert.match(pay, /requireApplicationAuth/);
  assert.match(pay, /PREVIEW_PAYMENT_ATOMICITY_NOT_CERTIFIED/);
  assert.match(pay, /SANDBOX_PAYMENT_REQUIRES_PREVIEW/);
  assert.doesNotMatch(pay, /INSERT INTO preview_sandbox_payment/);
  assert.doesNotMatch(pay, /UPDATE preview_member_commitment/);
  assert.doesNotMatch(pay, /INSERT INTO canonical_event/);
  assert.doesNotMatch(pay, /durableId\('payment'\)/);
});
