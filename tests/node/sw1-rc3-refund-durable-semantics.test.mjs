import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  new URL('../../api/authorize-refund.js', import.meta.url),
  new URL('../../api/complete-refund.js', import.meta.url),
];

for (const file of files) {
  test(`RC3 ${file.pathname.split('/').pop()} keeps production writes disabled and neutralizes durable semantics`, async () => {
    const source = await readFile(file, 'utf8');

    assert.match(source, /PREVIEW_REFUND_DISABLED_IN_PRODUCTION/);
    assert.match(source, /requireApplicationAuth/);
    assert.match(source, /canonicalRuntimeMetadata/);
    assert.match(source, /runtimeOwnerToken/);
    assert.match(source, /durableId\('event'\)/);
    assert.match(source, /durableId\('command'\)/);
    assert.match(source, /runtime\.actorId/);
    assert.match(source, /runtime\.environment/);

    assert.doesNotMatch(source, /`preview:(?:event|command|remedy):\$\{randomUUID\(\)\}`/);
    assert.doesNotMatch(source, /'vercel-preview'/);
    assert.doesNotMatch(source, /'operatorId',\$\{PREVIEW_OPERATOR_ID\}/);
    assert.doesNotMatch(source, /'environment','preview'/);
  });

  test(`RC3 ${file.pathname.split('/').pop()} treats database uniqueness races as replayable outcomes`, async () => {
    const source = await readFile(file, 'utf8');
    assert.match(source, /error\?\.code==='23505'/);
    assert.match(source, /SELECT \* FROM preview_refund_remedy WHERE obligation_id=\$\{obligationId\} OR .*request_id=\$\{requestId\} LIMIT 1/);
    assert.match(source, /idempotent:true/);
  });
}
