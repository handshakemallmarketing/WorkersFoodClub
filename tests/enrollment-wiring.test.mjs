import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const join = fs.readFileSync(new URL('../public/join.html', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../public/member-auth.js', import.meta.url), 'utf8');
const health = fs.readFileSync(new URL('../api/db-health.js', import.meta.url), 'utf8');
const apply = fs.readFileSync(new URL('../api/membership-apply.js', import.meta.url), 'utf8');
const status = fs.readFileSync(new URL('../api/membership-status.js', import.meta.url), 'utf8');

test('preview exposes real OIDC identity and application access without enabling live funds', () => {
  assert.match(health, /environment === 'preview'/);
  assert.match(health, /applicationAccessEnabled/);
  assert.match(health, /verifyProductionOidcRequest\(req\)/);
  assert.match(health, /liveFundsAuthorized: false/);
  assert.doesNotMatch(health, /IDENTITY_SUBJECT_DISCOVERY_PRODUCTION_ONLY/);
});

test('join flow uses deployment application access rather than production-only gate', () => {
  assert.match(join, /config\.applicationAccessEnabled!==true/);
  assert.doesNotMatch(join, /config\.productionApplicationAccessEnabled!==true/);
  assert.match(join, /\/api\/membership-apply/);
  assert.match(join, /Submit membership application/);
});

test('member sign-in and enrollment share the same real identity path', () => {
  assert.match(auth, /config\.applicationAccessEnabled!==true/);
  assert.match(auth, /\/api\/identity-subject/);
  assert.match(auth, /\/api\/membership-status/);
  assert.doesNotMatch(auth, /previewToken|Enter member preview/);
});

test('membership APIs permit preview but retain production application gate', () => {
  for (const source of [apply, status]) {
    assert.match(source, /VERCEL_ENV/);
    assert.match(source, /===['"]preview['"]/);
    assert.match(source, /requireProductionApplicationAccess/);
    assert.match(source, /verifyProductionOidcRequest/);
  }
});

test('ambiguous identity bindings fail closed', () => {
  assert.match(apply, /IDENTITY_BINDING_AMBIGUOUS/);
  assert.match(status, /IDENTITY_BINDING_AMBIGUOUS/);
});
