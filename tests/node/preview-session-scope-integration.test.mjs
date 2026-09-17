import test from 'node:test';
import assert from 'node:assert/strict';

import previewSession from '../../api/preview-session.js';
import { verifyPreviewApiToken } from '../../lib/preview-api-auth.js';

const SECRET = 'preview-scope-integration-test-0123456789-abcdefghijklmnopqrstuvwxyz';

function createResponse() {
  const result = { statusCode: null, body: null, headers: {} };
  return {
    result,
    setHeader(name, value) { result.headers[String(name).toLowerCase()] = value; return this; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

function bearer(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

test.beforeEach(() => {
  process.env.VERCEL_ENV = 'preview';
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
});

test('canonical Preview member token can reach the survey scope', async () => {
  const res = createResponse();
  await previewSession({ method: 'GET' }, res);
  assert.equal(res.result.statusCode, 200);

  const verified = verifyPreviewApiToken(
    bearer(res.result.body.memberToken),
    'member:engagement.survey'
  );
  assert.equal(verified.ok, true);
  assert.equal(verified.principal.actorId, 'preview:member:001');
});

test('support-case authority is Admin-only in canonical Preview tiers', async () => {
  const res = createResponse();
  await previewSession({ method: 'GET' }, res);
  assert.equal(res.result.statusCode, 200);

  const { fulfillment, finance, admin } = res.result.body.operatorTokens;
  assert.equal(verifyPreviewApiToken(bearer(admin), 'operator:support.manage').ok, true);

  const fulfillmentResult = verifyPreviewApiToken(
    bearer(fulfillment),
    'operator:support.manage'
  );
  assert.equal(fulfillmentResult.ok, false);
  assert.equal(fulfillmentResult.error, 'AUTHORIZATION_SCOPE_REQUIRED');

  const financeResult = verifyPreviewApiToken(
    bearer(finance),
    'operator:support.manage'
  );
  assert.equal(financeResult.ok, false);
  assert.equal(financeResult.error, 'AUTHORIZATION_SCOPE_REQUIRED');
});
