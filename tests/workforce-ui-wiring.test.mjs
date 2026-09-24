import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workforceHtml = fs.readFileSync(new URL('../public/workforce.html', import.meta.url), 'utf8');
const employeeHtml = fs.readFileSync(new URL('../public/employee.html', import.meta.url), 'utf8');
const governedFetch = fs.readFileSync(new URL('../public/governed-fetch-extension.js', import.meta.url), 'utf8');
const vercelJson = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('workforce.html hosts the existing workforce.js module behind auth.js + the governed-fetch bridge', () => {
  assert.match(workforceHtml, /<script src="\/governed-fetch-extension\.js">/);
  assert.match(workforceHtml, /<script src="\/auth\.js">/);
  assert.match(workforceHtml, /<script src="\/workforce\.js">/);
  assert.match(workforceHtml, /id="workforce-root"/);
  assert.match(workforceHtml, /data-view="workforce"/);
});

test('workforce.html gates its content behind superUserAccessAvailable, matching workforce.js\'s own applyAccess gate', () => {
  assert.match(workforceHtml, /superUserAccessAvailable/);
});

test('governed-fetch-extension.js already bridges the workforce endpoints workforce.js calls', () => {
  for (const path of ['/api/workforce-teams', '/api/workforce-tasks', '/api/workforce-domains', '/api/authority-directory']) {
    assert.ok(governedFetch.includes(`'${path}'`), `expected governed-fetch-extension.js to allowlist ${path}`);
  }
});

test('employee.html links to the new workforce authority page', () => {
  assert.match(employeeHtml, /href="\/workforce"/);
});

test('vercel.json rewrites /workforce to the new page', () => {
  const rewrite = vercelJson.rewrites.find(r => r.source === '/workforce');
  assert.ok(rewrite, 'expected a /workforce rewrite');
  assert.equal(rewrite.destination, '/workforce.html');
});
