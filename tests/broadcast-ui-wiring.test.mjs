import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const broadcastHtml = fs.readFileSync(new URL('../public/broadcast.html', import.meta.url), 'utf8');
const broadcastJs = fs.readFileSync(new URL('../public/broadcast.js', import.meta.url), 'utf8');
const employeeHtml = fs.readFileSync(new URL('../public/employee.html', import.meta.url), 'utf8');
const governedFetch = fs.readFileSync(new URL('../public/governed-fetch-extension.js', import.meta.url), 'utf8');
const vercelJson = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const operatorTiers = fs.readFileSync(new URL('../lib/operator-tiers.js', import.meta.url), 'utf8');
const workforceDomains = fs.readFileSync(new URL('../lib/workforce-domains.js', import.meta.url), 'utf8');

test('broadcast.html hosts broadcast.js behind auth.js + the governed-fetch bridge, gated on superUserAccessAvailable', () => {
  assert.match(broadcastHtml, /<script src="\/governed-fetch-extension\.js">/);
  assert.match(broadcastHtml, /<script src="\/auth\.js">/);
  assert.match(broadcastHtml, /<script src="\/broadcast\.js">/);
  assert.match(broadcastHtml, /superUserAccessAvailable/);
  assert.match(broadcastHtml, /data-view="broadcast"/);
});

test('broadcast.js confirms before sending and posts to /api/admin-broadcast', () => {
  assert.match(broadcastJs, /confirm\(/);
  assert.match(broadcastJs, /\/api\/admin-broadcast/);
  assert.match(broadcastJs, /method:\s*'POST'/);
});

test('governed-fetch-extension.js bridges /api/admin-broadcast', () => {
  assert.ok(governedFetch.includes("'/api/admin-broadcast'"));
});

test('employee.html links to the new member-notices page', () => {
  assert.match(employeeHtml, /href="\/broadcast"/);
});

test('vercel.json rewrites /broadcast to the new page', () => {
  const rewrite = vercelJson.rewrites.find((r) => r.source === '/broadcast');
  assert.ok(rewrite, 'expected a /broadcast rewrite');
  assert.equal(rewrite.destination, '/broadcast.html');
});

test('operator:broadcast.manage is admin-tier only', () => {
  assert.match(operatorTiers, /OPERATOR_BROADCAST_SCOPE='operator:broadcast\.manage'/);
  assert.match(operatorTiers, /BROADCAST_CAPABLE_OPERATORS=\[OPERATOR_ADMIN_ACTOR_ID\]/);
  const adminScopesLine = operatorTiers.split('\n').find((l) => l.includes('[OPERATOR_ADMIN_ACTOR_ID]:['));
  assert.match(adminScopesLine, /OPERATOR_BROADCAST_SCOPE/);
});

test('the broadcast capability is registered in the workforce authority matrix', () => {
  assert.match(workforceDomains, /communications:\['operator:broadcast\.manage'\]/);
});
