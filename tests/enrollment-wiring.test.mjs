import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const join = fs.readFileSync(new URL('../public/join.html', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../public/member-auth.js', import.meta.url), 'utf8');
const health = fs.readFileSync(new URL('../api/db-health.js', import.meta.url), 'utf8');
const verifyStart = fs.readFileSync(new URL('../api/enrollment-verify-start.js', import.meta.url), 'utf8');
const apply = fs.readFileSync(new URL('../api/membership-apply.js', import.meta.url), 'utf8');

test('preview can exercise real identity diagnostics without enabling live funds', () => {
  assert.match(health, /authenticationMode:'WFC_MEMBER_SESSION'/);
  assert.match(health, /applicationAccessEnabled/);
  assert.match(health, /liveFundsAuthorized:false/);
});

test('Join is self-service, uses verify-before-provision, and has no Google/OIDC dependency', () => {
  assert.match(join, /\/api\/enrollment-verify-start/);
  assert.match(join, /\/api\/enrollment-verify-complete/);
  assert.match(join, /governmentEmployer/);
  assert.doesNotMatch(join, /accounts\.google\.com|gsi\/client|Authorization:'Bearer/);
});

test('enrollment verification start has no identity-provider verifier and requires an employer or campaign', () => {
  assert.doesNotMatch(verifyStart, /verifyProductionOidcRequest|application_identity_binding/);
  assert.match(verifyStart, /governmentEmployer/);
  assert.match(verifyStart, /GOVERNMENT_EMPLOYER_REQUIRED/);
  assert.match(verifyStart, /campaignToken/);
});

test('the legacy apply endpoint no longer provisions membership directly (BLV2-DEC-031)', () => {
  assert.match(apply, /ENROLLMENT_FLOW_MOVED/);
  assert.match(apply, /\/api\/enrollment-verify-start/);
  assert.doesNotMatch(apply, /INSERT INTO application_membership/);
});

test('the legacy apply endpoint still accepts MANUAL-review applications as a queued request, not a membership grant', () => {
  assert.match(apply, /MEMBERSHIP_APPLICATION_REVIEW_MODE/);
  assert.match(apply, /review_mode,review_status\) VALUES \([^)]*'MANUAL','PENDING'\)/);
  assert.doesNotMatch(apply, /membership_subscription_invoice/);
});

test('member sign-in remains separate from enrollment and synthetic preview bypass is absent', () => {
  assert.match(auth, /\/api\/member-auth-challenge/);
  assert.match(auth, /\/api\/member-auth-verify/);
  assert.match(auth, /\/api\/membership-status/);
  assert.doesNotMatch(auth, /previewToken|Enter member preview|loadPreview/);
});
