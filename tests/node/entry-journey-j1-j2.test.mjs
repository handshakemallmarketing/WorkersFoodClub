import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guard = fs.readFileSync(new URL('../../public/entry-journey-guard.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');

test('J1 guard loads before application runtime', () => {
  const guardAt = index.indexOf('/entry-journey-guard.js');
  const appAt = index.indexOf('/app.js');
  assert.ok(guardAt > 0 && appAt > guardAt);
});

test('J1 locally suppresses protected guest reads and mutations', () => {
  for (const path of ['/api/member-orders', '/api/member-notifications', '/api/operator-orders', '/api/commit-sandbox']) {
    assert.match(guard, new RegExp(path.replaceAll('/', '\\/')));
  }
  assert.match(guard, /X-WFC-Local-Guard/);
  assert.match(guard, /status\s*:\s*identityVerified\s*\?\s*403\s*:\s*401/);
});

test('J1 public offer mutation is converted to a conversion CTA', () => {
  assert.match(app, /data-commit-offer/);
  assert.match(guard, /removeAttribute\('data-commit-offer'\)/);
  assert.match(guard, /Sign in to order/);
});

test('J2 authenticated unbound identity is isolated from normal shell', () => {
  assert.match(guard, /identityVerified\s*&&\s*!memberAccess/);
  assert.match(guard, /We couldn't find an active WorkersFoodClub membership/);
  assert.match(guard, /Signing in verifies your identity, but it does not create membership/);
  assert.match(guard, /MEMBERSHIP_REQUIRED/);
});

test('J2 offers apply and support recovery paths rather than member access', () => {
  assert.match(guard, /href="\/apply"/);
  assert.match(guard, /Contact support/);
});
