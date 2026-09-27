import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const authJs = fs.readFileSync(new URL('../public/auth.js', import.meta.url), 'utf8');
const memberShell = fs.readFileSync(new URL('../public/member-shell.js', import.meta.url), 'utf8');
const operatorHtml = fs.readFileSync(new URL('../public/operator-fulfillment.html', import.meta.url), 'utf8');
const operatorJs = fs.readFileSync(new URL('../public/operator-fulfillment.js', import.meta.url), 'utf8');
const employeeHtml = fs.readFileSync(new URL('../public/employee.html', import.meta.url), 'utf8');
const vercelJson = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('auth.js now attaches bearer tokens to catalog-admin/catalog-offers (BLV2-DEC pre-existing bug fix)', () => {
  const protectedBlock = authJs.slice(authJs.indexOf('protectedReadPaths'), authJs.indexOf('protectedReadPaths') + 400);
  assert.match(protectedBlock, /\/api\/catalog-admin/);
  assert.match(protectedBlock, /\/api\/catalog-offers/);
});

test('auth.js grants the fulfillment-release-code path to the member preview tier', () => {
  const memberBlock = authJs.slice(authJs.indexOf('previewMemberPaths'), authJs.indexOf('previewOperatorPaths'));
  assert.match(memberBlock, /\/api\/fulfillment-release-code/);
});

test('auth.js grants catalog and fulfillment-release-redeem paths to the operator preview tier only', () => {
  const operatorBlock = authJs.slice(authJs.indexOf('previewOperatorPaths'));
  assert.match(operatorBlock, /\/api\/catalog-admin/);
  assert.match(operatorBlock, /\/api\/catalog-offers/);
  assert.match(operatorBlock, /\/api\/fulfillment-release-redeem/);
  const memberBlock = authJs.slice(authJs.indexOf('previewMemberPaths'), authJs.indexOf('previewOperatorPaths'));
  assert.doesNotMatch(memberBlock, /\/api\/fulfillment-release-redeem/);
});

test('member shell offers a pickup-code action on READY fulfillments and posts to fulfillment-release-code', () => {
  assert.match(memberShell, /data-release-code-fulfillment/);
  assert.match(memberShell, /\/api\/fulfillment-release-code/);
  assert.match(memberShell, /getReleaseCode/);
});

test('the new operator fulfillment page loads auth.js and its own dedicated script, matching the catalog-admin pattern', () => {
  assert.match(operatorHtml, /<script src="\/auth\.js">/);
  assert.match(operatorHtml, /<script src="\/operator-fulfillment\.js">/);
  assert.match(operatorHtml, /id="fulfillment-list"/);
});

test('operator-fulfillment.js reads /api/operator-orders and can mark ready and redeem release codes, but does not add refund actions', () => {
  assert.match(operatorJs, /\/api\/operator-orders/);
  assert.match(operatorJs, /\/api\/fulfillment-ready/);
  assert.match(operatorJs, /\/api\/fulfillment-release-redeem/);
  assert.match(operatorJs, /foodclub:auth-state/);
  assert.doesNotMatch(operatorJs, /\/api\/authorize-refund|\/api\/complete-refund/);
});

test('employee.html links to the new operator fulfillment page', () => {
  assert.match(employeeHtml, /href="\/operator-fulfillment"/);
});

test('vercel.json rewrites /operator-fulfillment to the new page', () => {
  const rewrite = vercelJson.rewrites.find(r => r.source === '/operator-fulfillment');
  assert.ok(rewrite, 'expected an /operator-fulfillment rewrite');
  assert.equal(rewrite.destination, '/operator-fulfillment.html');
});
