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

test('member sign-in uses identity then authoritative membership resolution', () => {
  assert.match(auth, /\/api\/identity-subject/);
  assert.match(auth, /\/api\/membership-status/);
  assert.match(auth, /status\.memberAccessAvailable===true/);
  assert.match(auth, /status\.accessState==='ACTIVE_CURRENT'/);
  assert.match(auth, /status\.route==='MEMBER'/);
});

test('member UI exposes governed non-member states', () => {
  for (const route of ['APPLICATION_STATUS','SUBSCRIPTION_DUE','RESTRICTED','NON_MEMBER']) assert.match(auth, new RegExp(`route==='${route}'`));
});

test('member shell keeps employee authority out of member auth controller', () => {
  assert.match(auth, /operatorAccessAvailable:false/);
  assert.match(auth, /superUserAccessAvailable:false/);
  assert.match(html, /Member sign in/);
});
