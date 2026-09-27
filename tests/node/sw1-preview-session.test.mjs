import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/preview-session.js';
import { OPERATOR_ADMIN_ACTOR_ID, OPERATOR_TIER_SCOPES } from '../../lib/operator-tiers.js';

const SECRET = 'preview-session-test-secret-0123456789-abcdefghijklmnop';

function createResponse() {
  const result = { statusCode: null, body: null, headers: {} };
  return {
    result,
    setHeader(name, value) { result.headers[String(name).toLowerCase()] = value; return this; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

test.beforeEach(() => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
});

for (const value of [undefined, '', 'production', 'staging', 'Preview']) {
  test(`preview-session fails closed when VERCEL_ENV is ${JSON.stringify(value)}`, async () => {
    if (value === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = value;

    const res = createResponse();
    await handler({ method: 'GET' }, res);

    assert.equal(res.result.statusCode, 403);
    assert.equal(res.result.body?.error, 'PREVIEW_SESSION_PREVIEW_ONLY');
  });
}

test('preview-session mints scoped tokens for every operator tier plus a backward-compatible admin alias', async () => {
  process.env.VERCEL_ENV = 'preview';
  const res = createResponse();
  await handler({ method: 'GET' }, res);

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.ok, true);
  assert.equal(typeof res.result.body.memberToken, 'string');
  assert.equal(typeof res.result.body.operatorTokens.fulfillment, 'string');
  assert.equal(typeof res.result.body.operatorTokens.finance, 'string');
  assert.equal(typeof res.result.body.operatorTokens.admin, 'string');
  assert.equal(res.result.body.operatorToken, res.result.body.operatorTokens.admin);

  const [, payloadPart] = res.result.body.operatorTokens.admin.split('.');
  const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  assert.equal(claims.actorId, OPERATOR_ADMIN_ACTOR_ID);
  assert.deepEqual([...claims.scopes].sort(), [...OPERATOR_TIER_SCOPES[OPERATOR_ADMIN_ACTOR_ID]].sort());
});
