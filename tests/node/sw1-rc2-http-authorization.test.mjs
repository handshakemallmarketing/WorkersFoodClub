import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mintPreviewApiToken,
  verifyPreviewApiToken,
} from '../../lib/preview-api-auth.js';

const SECRET = 'rc2-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const NOW = Date.parse('2026-09-12T06:30:00Z');
const NOW_SEC = Math.floor(NOW / 1000);

function req(token) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

function token(overrides = {}) {
  return mintPreviewApiToken({
    secret: SECRET,
    subject: 'preview-user:test',
    actorId: 'preview:member:001',
    scopes: ['member:orders.read'],
    issuedAt: NOW_SEC - 5,
    expiresAt: NOW_SEC + 300,
    ...overrides,
  });
}


test('RC2 preview HTTP authorization fails closed in production', () => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'production';

  const result = verifyPreviewApiToken(
    req(token()),
    'member:orders.read',
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error, 'PREVIEW_AUTH_DISABLED_IN_PRODUCTION');
});

test('RC2 HTTP authorization rejects missing credential', () => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'preview';

  const result = verifyPreviewApiToken(
    req(),
    'member:orders.read',
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, 'AUTHENTICATION_REQUIRED');
});

test('RC2 HTTP authorization rejects forged credential', () => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'preview';

  const valid = token();
  const forged = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;

  const result = verifyPreviewApiToken(
    req(forged),
    'member:orders.read',
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, 'TOKEN_INVALID');
});

test('RC2 HTTP authorization rejects expired credential', () => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'preview';

  const expired = token({
    issuedAt: NOW_SEC - 600,
    expiresAt: NOW_SEC - 60,
  });

  const result = verifyPreviewApiToken(
    req(expired),
    'member:orders.read',
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, 'TOKEN_EXPIRED_OR_NOT_YET_VALID');
});

test('RC2 HTTP authorization rejects wrong scope', () => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'preview';

  const result = verifyPreviewApiToken(
    req(token()),
    'operator:orders.read',
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, 'AUTHORIZATION_SCOPE_REQUIRED');
});

test('RC2 HTTP authorization accepts bounded actor and scope', () => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'preview';

  const result = verifyPreviewApiToken(
    req(token()),
    'member:orders.read',
    NOW,
  );

  assert.equal(result.ok, true);
  assert.equal(result.principal.actorId, 'preview:member:001');
  assert.equal(result.principal.subject, 'preview-user:test');
});

test('RC2 HTTP authorization rejects authenticated actor mismatch', async () => {
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'preview';

  const responses = [];
  const res = {
    setHeader() {},
    status(code) {
      responses.push({ code });
      return this;
    },
    json(body) {
      responses[responses.length - 1].body = body;
      return this;
    },
  };

  const valid = token({
    actorId: 'preview:member:other',
  });

  const { requirePreviewApiAuth } =
    await import('../../lib/preview-api-auth.js');

  const principal = requirePreviewApiAuth(
    req(valid),
    res,
    'member:orders.read',
    'preview:member:001',
    NOW,
  );

  assert.equal(principal, null);
  assert.equal(responses[0].code, 403);
  assert.equal(
    responses[0].body.error,
    'AUTHENTICATED_ACTOR_MISMATCH',
  );
});
