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
  assert.throws(
    () => validate(`${matrixSource}\n"status": LAUNCH_AUTHORIZED\n`),
    /DUPLICATE_TOP_LEVEL_KEY:status/,
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

test('requires records to live under the journeys section', () => {
  assert.throws(() => validate(matrixSource.replace(/^journeys:/m, 'not_journeys:')), /UNKNOWN_TOP_LEVEL_KEY:not_journeys|JOURNEYS_SECTION_MISSING/);
  assert.throws(
    () => validate(matrixSource.replace(/^  - \{id: UC-01/m, '\t\t- {id: UC-01')),
    /INVALID_JOURNEY_SYNTAX/,
  );
  assert.throws(
    () => validate(`${matrixSource}\n  - id: UC-31\n    classification: PROVEN\n`),
    /INVALID_JOURNEY_SYNTAX/,
  );
  assert.throws(
    () => validate(`${matrixSource}\n  - UC-31\n`),
    /INVALID_JOURNEY_SYNTAX/,
  );
});

test('rejects tagged semantic aliases inside journey mappings', () => {
  assert.throws(
    () => validate(matrixSource.replace('classification: PARTIAL', 'classification: PARTIAL, !!str classification: PROVEN')),
    /JOURNEY_FLOW_PARSE_ERROR:invalid-key/,
  );
});

test('rejects tagged or explicit-key top-level aliases', () => {
  assert.throws(
    () => validate(`${matrixSource}\n!!str status: LAUNCH_AUTHORIZED\n`),
    /INVALID_TOP_LEVEL_SYNTAX/,
  );
  assert.throws(
    () => validate(`${matrixSource}\n? status\n: LAUNCH_AUTHORIZED\n`),
    /INVALID_TOP_LEVEL_SYNTAX/,
  );
});

test('rejects inherited object-property classifications', () => {
  const changed = matrixSource
    .replace('  UNPROVEN: 2', '  UNPROVEN: 1')
    .replace('id: UC-13, objective: "Third-party release code", owner_agent: A7, dependencies: [UC-23], classification: UNPROVEN', 'id: UC-13, objective: "Third-party release code", owner_agent: A7, dependencies: [UC-23], classification: toString');
  assert.throws(() => validate(changed), /JOURNEY_CLASSIFICATION_INVALID:UC-13/);
});

test('rejects additional UC-08 and UC-10 authority', () => {
  assert.throws(
    () => validate(matrixSource.replace('authorization_scopes: ["member:payment.execute"]', 'authorization_scopes: ["member:payment.execute", "member:live-funds.execute"]')),
    /UC08_FAIL_CLOSED_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => validate(matrixSource.replace('authorized_operator_tiers: ["FULFILLMENT_CAPABLE_OPERATORS"]', 'authorized_operator_tiers: ["FULFILLMENT_CAPABLE_OPERATORS", "UNBOUNDED"]')),
    /UC10_DEPENDENCY_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => validate(matrixSource.replace('severity: P0, launch_requirement: REQUIRED, final_disposition: DEPENDENCY_BLOCKED', 'severity: P2, launch_requirement: OPTIONAL, final_disposition: DEPENDENCY_BLOCKED')),
    /UC10_DEPENDENCY_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => validate(matrixSource.replace('remaining_gaps: ["exact-RC independent browser/API/PostgreSQL/TEST-provider proof", "partial/overpayment/reversal/out-of-order recovery certification", "obsolete Preview HTTP rehearsal assertions"], severity: P0, launch_requirement: REQUIRED, final_disposition: IMPLEMENTATION_EVIDENCE_OPEN_PRODUCTION_WITHHELD', 'remaining_gaps: ["exact-RC independent browser/API/PostgreSQL/TEST-provider proof", "partial/overpayment/reversal/out-of-order recovery certification", "obsolete Preview HTTP rehearsal assertions"], severity: P0, launch_requirement: OPTIONAL, final_disposition: IMPLEMENTATION_EVIDENCE_OPEN_PRODUCTION_WITHHELD')),
    /UC08_FAIL_CLOSED_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => validate(matrixSource.replace('id: UC-08, objective: "Minimum commitment payment", owner_agent: A4, dependencies: [UC-07]', 'id: UC-08, objective: "Minimum commitment payment", owner_agent: A4, dependencies: []')),
    /UC08_FAIL_CLOSED_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => validate(matrixSource.replace('id: UC-10, objective: "Demand-pool qualification", owner_agent: A5, dependencies: [UC-08, UC-09], classification: PARTIAL', 'id: UC-10, objective: "Demand-pool qualification", owner_agent: A5, dependencies: [UC-08, UC-09], classification: MISSING').replace('  PARTIAL: 21', '  PARTIAL: 20').replace('  MISSING: 7', '  MISSING: 8')),
    /UC10_DEPENDENCY_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => validate(matrixSource.replace('id: UC-10, objective: "Demand-pool qualification"', 'id: UC-10, objective: "Demand-pool qualification"').replace('preview_evidence: ["implementation evidence only"], production_evidence: ["mutations withheld"], remaining_gaps: ["UC-08 exact-RC evidence dependency"', 'preview_evidence: ["implementation evidence only"], production_evidence: ["mutations enabled"], remaining_gaps: ["UC-08 exact-RC evidence dependency"')),
    /UC10_DEPENDENCY_BOUNDARY_INVALID/,
  );
});

test('rejects unknown or widened safety-boundary capabilities', () => {
  assert.throws(
    () => validate(matrixSource.replace('  production_credit_mutations: WITHHELD', '  production_credit_mutations: WITHHELD\n  production_new_capability: ENABLED')),
    /UNKNOWN_SAFETY_BOUNDARY_KEY:production_new_capability/,
  );
  assert.throws(
    () => validate(matrixSource.replace('  production_payroll_cagd_mutations: WITHHELD', '  production_payroll_cagd_mutations: ENABLED')),
    /AUTHORITY_WIDENING_FORBIDDEN:production_payroll_cagd_mutations/,
  );
  assert.throws(
    () => validate(matrixSource.replace('  production_credit_mutations: WITHHELD', '  production_credit_mutations: WITHHELD\n  "production_credit_mutations": ENABLED')),
    /DUPLICATE_MAPPING_KEY:safety_boundary.production_credit_mutations/,
  );
  assert.throws(
    () => validate(matrixSource.replace('  production_credit_mutations: WITHHELD', '  production_credit_mutations: WITHHELD\n  "production_new_capability": ENABLED')),
    /UNKNOWN_SAFETY_BOUNDARY_KEY:production_new_capability/,
  );
  assert.throws(
    () => validate(matrixSource.replace('  live_funds: WITHHELD', '  live_funds: WITHHELD"')),
    /AUTHORITY_WIDENING_FORBIDDEN:live_funds/,
  );
  assert.throws(
    () => validate(matrixSource.replace('status: WORKING_BASELINE_NOT_LAUNCH_AUTHORIZATION', 'status: WORKING_BASELINE_NOT_LAUNCH_AUTHORIZATION"')),
    /JOURNEY_MATRIX_STATUS_MUST_NOT_AUTHORIZE_LAUNCH/,
  );
  assert.throws(
    () => validate(matrixSource.replace('  production_credit_mutations: WITHHELD', '  !!str production_credit_mutations: ENABLED')),
    /INVALID_SAFETY_BOUNDARY_SYNTAX/,
  );
});

test('requires canonical summary counts', () => {
  assert.throws(
    () => validate(matrixSource.replace('  PROVEN: 0', '  PROVEN: 0x0')),
    /JOURNEY_SUMMARY_VALUE_INVALID:PROVEN/,
  );
  assert.throws(
    () => validate(matrixSource.replace('  PROVEN: 0', '  PROVEN: ""')),
    /JOURNEY_SUMMARY_VALUE_INVALID:PROVEN/,
  );
  assert.throws(
    () => validate(matrixSource.replace('  PROVEN: 0', '  PROVEN: "0"')),
    /JOURNEY_SUMMARY_VALUE_INVALID:PROVEN/,
  );
});

test('rejects contradictory UC-08 evidence additions', () => {
  assert.throws(
    () => validate(matrixSource.replace('production_evidence: ["mutations withheld"]', 'production_evidence: ["mutations withheld", "mutations enabled"]')),
    /UC08_FAIL_CLOSED_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => validate(matrixSource.replace('policy_evidence: ["BLV2-DEC-024", "PR-15", "PR-16", "PR-17", "PR-18"]', 'policy_evidence: ["BLV2-DEC-024", "PR-15", "PR-16", "PR-17", "PR-18", "UNRATIFIED"]')),
    /UC08_FAIL_CLOSED_BOUNDARY_INVALID/,
  );
});

test('rejects unknown and cyclic dependencies', () => {
  assert.throws(
    () => validate(matrixSource.replace('id: UC-01, objective: "Member application", owner_agent: A2, dependencies: []', 'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [UC-99]')),
    /JOURNEY_DEPENDENCY_UNKNOWN:UC-01:UC-99/,
  );
  assert.throws(
    () => validate(matrixSource.replace('id: UC-01, objective: "Member application", owner_agent: A2, dependencies: []', 'id: UC-01, objective: "Member application", owner_agent: A2, dependencies: [UC-02]')),
    /JOURNEY_DEPENDENCY_CYCLE:/,
  );
  assert.throws(
    () => validate(matrixSource.replace('id: UC-02, objective: "Membership activation and Member ID", owner_agent: A2, dependencies: [UC-01]', 'id: UC-02, objective: "Membership activation and Member ID", owner_agent: A2, dependencies: [UC-01, UC-01]')),
    /JOURNEY_DEPENDENCY_DUPLICATE:UC-02/,
  );
});
