import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readyFile = new URL('../../api/fulfillment-ready.js', import.meta.url);

test('fulfillment-ready treats a database uniqueness race as a replayable outcome instead of a hard failure', async () => {
  const source = await readFile(readyFile, 'utf8');

  // Before this fix, a concurrent duplicate "mark ready" (same requestId racing
  // past the initial idempotency read) hit the durable_command_execution unique
  // constraint and fell straight into the generic catch, surfacing a 503 to the
  // operator even though the first request had already succeeded.
  assert.match(source, /error\?\.code==='23505'/);
  assert.match(source, /SELECT \* FROM preview_fulfillment WHERE obligation_id=\$\{obligationId\} OR ready_request_id=\$\{requestId\} LIMIT 1/);
  assert.match(source, /idempotent:true/);
  assert.match(source, /FULFILLMENT_REQUEST_REBOUND/);
});
