import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../public/member-auth.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('member sign-in does not expose the synthetic preview-member bypass', () => {
  assert.doesNotMatch(auth, /Enter member preview/);
  assert.doesNotMatch(auth, /previewToken/);
  assert.doesNotMatch(auth, /loadPreview/);
});

test('member sign-in uses a phone-challenge session, not the legacy OIDC identity-subject probe', () => {
  assert.doesNotMatch(auth, /\/api\/identity-subject/);
  assert.match(auth, /\/api\/member-auth-challenge/);
  assert.match(auth, /\/api\/member-auth-verify/);
  assert.match(auth, /\/api\/membership-status/);
  assert.match(auth, /memberAccess = body\.memberAccessAvailable === true/);
});

test('member UI gates on the authoritative membership-status response, not a client-guessed route', () => {
  assert.match(auth, /status\?\.accessState/);
  assert.match(auth, /status\?\.invoice/);
  assert.match(auth, /status\?\.sandboxPaymentAvailable/);
});

test('member shell keeps employee authority out of member auth controller', () => {
  assert.match(auth, /operatorAccessAvailable: false/);
  assert.match(auth, /superUserAccessAvailable: false/);
  assert.match(html, /Member sign in/);
});

test('a member who loses their Member Number has a self-service recovery path', () => {
  assert.match(auth, /\/api\/member-number-recovery-start/);
  assert.match(auth, /\/api\/member-number-recovery-verify/);
  assert.match(auth, /Forgot your Member Number/);
});
