import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapping = JSON.parse(readFileSync(new URL('../../docs/governance/DATABASE_BINDING_TARGETS-v1.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../../.github/workflows/rc2-preview-http-rehearsal.yml', import.meta.url), 'utf8');
const retiredScript = readFileSync(new URL('../../scripts/test-preview-http-rehearsal.mjs', import.meta.url), 'utf8');

test('governed mapping pins distinct Preview and Production branches', () => {
  assert.equal(mapping.project.provider, 'NEON');
  assert.equal(mapping.project.projectId, 'wispy-dawn-96331519');
  assert.equal(mapping.preview.branchId, 'br-purple-grass-aej54d2x');
  assert.equal(mapping.preview.hostSha256, 'efecbc10be311dc3b95f981eb70329b7e2402e526399b4414083e96f56549946');
  assert.equal(mapping.preview.evidenceDecision, 'BLV2-DEC-016');
  assert.equal(mapping.production.branchId, 'br-winter-poetry-ae8qho57');
  assert.notEqual(mapping.preview.branchId, mapping.production.branchId);
});

test('unknown Production binding and hosted schema are not overstated', () => {
  assert.equal(mapping.production.hostSha256, null);
  assert.equal(mapping.production.verificationStatus, 'UNVERIFIED');
  assert.equal(mapping.constraints.sourceDatabasesReadOnly, true);
  assert.equal(mapping.constraints.destructiveTestsRestrictedToIsolatedChildren, true);
  assert.equal(mapping.constraints.hostedAppliedSchemaCertification, 'UNKNOWN');
});

test('legacy hosted mutating rehearsal fails closed without credentials or candidate code', () => {
  assert.match(workflow, /RETIRED_MUTATING_HOSTED_REHEARSAL/);
  assert.match(workflow, /exit 1/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /secrets\.|DATABASE_URL|VERCEL_TOKEN|expected_sha|preview_url/);
  assert.doesNotMatch(workflow, /actions\/checkout|node scripts\//);
  assert.match(retiredScript, /RETIRED_MUTATING_HOSTED_REHEARSAL/);
});
