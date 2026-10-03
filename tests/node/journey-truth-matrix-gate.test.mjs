import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateJourneyTruthMatrix } from '../../scripts/check-journey-truth-matrix.mjs';

const matrixSource = fs.readFileSync('docs/business-logic-v2/master-journey-truth-matrix.yaml', 'utf8');
const baseline = JSON.parse(fs.readFileSync('constitution/baseline.json', 'utf8'));
const productionAuthorization = JSON.parse(fs.readFileSync('docs/governance/PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json', 'utf8'));
const validate = (source = matrixSource, overrides = {}) => validateJourneyTruthMatrix({
  matrixSource: source,
  baseline,
  productionAuthorization,
  corpusExists: true,
  ...overrides,
});

test('accepts the conservative 30-journey baseline', () => {
  const result = validate();
  assert.deepEqual(result.counts, { PROVEN: 0, PARTIAL: 21, UNPROVEN: 2, MISSING: 7 });
});

test('rejects a silent UC-08 promotion', () => {
  const changed = matrixSource.replace(
    'id: UC-08, objective: "Minimum commitment payment", owner_agent: A4, dependencies: [UC-07], classification: UNPROVEN',
    'id: UC-08, objective: "Minimum commitment payment", owner_agent: A4, dependencies: [UC-07], classification: PARTIAL',
  );
  assert.throws(() => validate(changed), /JOURNEY_SUMMARY_MISMATCH|UC08_FAIL_CLOSED_BOUNDARY_INVALID/);
});

test('rejects widening live-funds authority', () => {
  const changed = matrixSource.replace('  live_funds: WITHHELD', '  live_funds: ENABLED');
  assert.throws(() => validate(changed), /AUTHORITY_WIDENING_FORBIDDEN:live_funds/);
});

test('rejects an unratified constitutional source', () => {
  assert.throws(() => validate(matrixSource, { baseline: { ...baseline, status: 'PROPOSED' } }), /CONSTITUTIONAL_RATIFICATION_NOT_PROVEN/);
});

test('requires exact-RC evidence before any PROVEN classification', () => {
  const changed = matrixSource
    .replace('  PROVEN: 0', '  PROVEN: 1')
    .replace('  PARTIAL: 21', '  PARTIAL: 20')
    .replace(
      'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PARTIAL',
      'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PROVEN',
    );
  assert.throws(() => validate(changed), /PROVEN_WITHOUT_EXACT_RC_EVIDENCE:UC-01/);
});

test('rejects empty exact-RC evidence on a PROVEN classification', () => {
  const changed = matrixSource
    .replace('  PROVEN: 0', '  PROVEN: 1')
    .replace('  PARTIAL: 21', '  PARTIAL: 20')
    .replace(
      'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PARTIAL',
      'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PROVEN, exact_rc_evidence: []',
    );
  assert.throws(() => validate(changed), /PROVEN_WITHOUT_EXACT_RC_EVIDENCE:UC-01/);
});

test('rejects a duplicate semantic journey key', () => {
  const changed = matrixSource.replace(
    'id: UC-01, objective: "Member application"',
    'id: UC-01, classification: PROVEN, objective: "Member application"',
  );
  assert.throws(() => validate(changed), /DUPLICATE_JOURNEY_KEY:classification/);
});

test('binds matrix authorization truth to the governed Production SHA', () => {
  const changed = matrixSource.replace(
    'standing_governed_production_sha: e67bf163db4bf87317766b1c58da84ea076de76f',
    'standing_governed_production_sha: ca9224c98f47cb8c50cac5033e053b081abd013f',
  );
  assert.throws(() => validate(changed), /STANDING_PRODUCTION_SHA_TRUTH_INVALID/);
});

test('rejects duplicate top-level authority keys and sections', () => {
  assert.throws(
    () => validate(`${matrixSource}\nstatus: LAUNCH_AUTHORIZED\n`),
    /DUPLICATE_TOP_LEVEL_KEY:status/,
  );
  assert.throws(
    () => validate(`${matrixSource}\nsummary:\n  PROVEN: 30\n`),
    /DUPLICATE_TOP_LEVEL_KEY:summary/,
  );
});

test('rejects fabricated format-only exact-RC evidence', () => {
  const fakeEvidence = '{commit_sha: "0000000000000000000000000000000000000000", tree_sha: "1111111111111111111111111111111111111111", deployment_id: dpl_fake, runtime_evidence: x}';
  const changed = matrixSource
    .replace('  PROVEN: 0', '  PROVEN: 1')
    .replace('  PARTIAL: 21', '  PARTIAL: 20')
    .replace(
      'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PARTIAL',
      `id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PROVEN, exact_rc_evidence: [${fakeEvidence}]`,
    );
  assert.throws(() => validate(changed), /PROVEN_WITHOUT_EXACT_RC_EVIDENCE:UC-01/);
});

test('rejects fully shaped but unverifiable remote evidence', () => {
  const fakeEvidence = `{commit_sha: "ca9224c98f47cb8c50cac5033e053b081abd013f", tree_sha: "1234567890abcdef1234567890abcdef12345678", deployment_id: dpl_fake123, immutable_deployment_url: "https://fake-never-existed.vercel.app", ci_run_url: "https://github.com/handshakemallmarketing/WorkersFoodClub/actions/runs/999999999999999", ci_conclusion: SUCCESS, independent_review: {verdict: APPROVED, reviewed_commit_sha: "ca9224c98f47cb8c50cac5033e053b081abd013f", reviewer: fake}, runtime_evidence: {browser: "https://github.com/handshakemallmarketing/WorkersFoodClub/actions/runs/999999999999999", api: "https://github.com/handshakemallmarketing/WorkersFoodClub/actions/runs/999999999999999", postgresql: "https://github.com/handshakemallmarketing/WorkersFoodClub/actions/runs/999999999999999", provider: "https://github.com/handshakemallmarketing/WorkersFoodClub/actions/runs/999999999999999"}}`;
  const changed = matrixSource
    .replace('  PROVEN: 0', '  PROVEN: 1')
    .replace('  PARTIAL: 21', '  PARTIAL: 20')
    .replace(
      'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PARTIAL',
      `id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [], classification: PROVEN, exact_rc_evidence: [${fakeEvidence}]`,
    );
  assert.throws(
    () => validate(changed),
    /PROVEN_REQUIRES_ONLINE_INDEPENDENT_CERTIFICATION_GATE/,
  );
});
