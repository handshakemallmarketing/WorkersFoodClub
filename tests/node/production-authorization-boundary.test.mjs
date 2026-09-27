import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVATION_WORKFLOW,
  applicationAccessEnableWriter,
  assertSafeWorkflow,
  checkProductionAuthorizationWorkflows,
} from '../../scripts/check-production-authorization-workflows.mjs';

const governedSha = 'e67bf163db4bf87317766b1c58da84ea076de76f';

test('repository preserves the exact governed Production authorization boundary', async () => {
  const result = await checkProductionAuthorizationWorkflows();
  assert.equal(result.governedSha, governedSha);
});

test('push-main workflows cannot receive Production mutation capability', () => {
  for (const trigger of [
    'on: push',
    'on: [push]',
    'on: { push: {} }',
    "'on':\n  push:\n    branches: ['main']",
    'on:\n  push:',
    'on:\n  push: {}',
    'on:\n  push:\n    branches: [main]',
    "on:\n  push:\n    branches:\n      - 'main'",
    'on:\n  push:\n    branches:\n      - "main"',
    "on:\n  push:\n    branches:\n      - '**'",
    'on:\n  push:\n    branches: ["release/**"]',
  ]) {
    for (const capability of [
      '    environment: production',
      '    environment:\n      name: production',
      '        VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
      "        VERCEL_TOKEN: ${{ secrets['VERCEL_TOKEN'] }}",
      '    uses: ./.github/workflows/mutate.yml\n    secrets: inherit',
      '    permissions:\n      id-token: write',
      '      - run: vercel deploy --prod',
      '      - run: curl https://api.vercel.com/v10/projects/p/env',
    ]) {
      const source = `${trigger}\njobs:\n  mutate:\n${capability}\n`;
      assert.throws(
        () => assertSafeWorkflow({ filename: 'attack.yml', source, governedSha }),
        /UNALLOWLISTED_PRODUCTION_MUTATION_WORKFLOW|PUSH_TO_MAIN_PRODUCTION_MUTATION_FORBIDDEN/,
      );
    }
  }
});

test('a new workflow cannot acquire Production mutation capability by indirection', () => {
  const source = `on:\n  workflow_dispatch:\njobs:\n  mutate:\n    environment: production\n    steps:\n      - env:\n          VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}\n        run: node scripts/indirect-production-mutation.mjs`;
  assert.throws(
    () => assertSafeWorkflow({ filename: 'alternate-production-path.yml', source, governedSha }),
    /UNALLOWLISTED_PRODUCTION_MUTATION_WORKFLOW/,
  );
});

test('only the governed activation workflow may write the Production SHA pin', () => {
  const source = `on:\n  workflow_dispatch:\njobs:\n  mutate:\n    steps:\n      - run: |\n          curl --request POST example\n          '{"key":"PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA"}'`;
  assert.throws(
    () => assertSafeWorkflow({ filename: 'alternate-ceremony.yml', source, governedSha }),
    /UNALLOWLISTED_PRODUCTION_AUTHORIZATION_WRITER/,
  );
});

test('compound grep lines cannot hide an authorization write', () => {
  const source = `on:\n  workflow_dispatch:\njobs:\n  mutate:\n    steps:\n      - run: |\n          grep -q harmless file; curl --request POST example --data '{"key":"PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA"}'`;
  assert.throws(
    () => assertSafeWorkflow({ filename: 'production-access-v2-containment.yml', source, governedSha }),
    /UNALLOWLISTED_PRODUCTION_AUTHORIZATION_WRITER/,
  );
});

test('alternate Vercel CLI syntax cannot write the authorization pin', () => {
  const source = `on:\n  workflow_dispatch:\njobs:\n  mutate:\n    steps:\n      - run: vercel env add PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA production`;
  assert.throws(
    () => assertSafeWorkflow({ filename: 'production-access-v2-containment.yml', source, governedSha }),
    /UNALLOWLISTED_PRODUCTION_AUTHORIZATION_WRITER/,
  );
});

test('only governed activation and recovery may enable Production application access', () => {
  const source = 'on: workflow_dispatch\njobs:\n  mutate:\n    steps:\n      - run: vercel deploy --prod --env PRODUCTION_APPLICATION_ACCESS_ENABLED=true';
  assert.equal(applicationAccessEnableWriter(source), true);
  assert.throws(
    () => assertSafeWorkflow({ filename: 'rc3-bounded-production-identity-rehearsal.yml', source, governedSha }),
    /UNALLOWLISTED_PRODUCTION_MUTATION_WORKFLOW|UNALLOWLISTED_PRODUCTION_ACCESS_ENABLE_WRITER/,
  );
});

test('activation writer rejects trigger-derived and governance-mismatched candidates', () => {
  const base = `on:\n  workflow_dispatch:\njobs:\n  activate:\n    environment: production\n    env:\n      ACTIVATION_SHA: '${governedSha}'\n    steps:\n      - run: |\n          grant.get('candidateSha') == os.environ['ACTIVATION_SHA']\n          grant.get('revoked') is False\n          curl --request POST example --arg sha "$ACTIVATION_SHA" --env PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA="$ACTIVATION_SHA"`;
  assert.doesNotThrow(() => assertSafeWorkflow({ filename: ACTIVATION_WORKFLOW, source: base, governedSha }));
  assert.throws(
    () => assertSafeWorkflow({
      filename: ACTIVATION_WORKFLOW,
      source: base.replace('--arg sha "$ACTIVATION_SHA"', '--arg sha "$GITHUB_SHA"'),
      governedSha,
    }),
    /ACTIVATION_FIXED_CANDIDATE_WRITE_MISSING|NON_GOVERNED_PRODUCTION_AUTHORIZATION_CANDIDATE/,
  );
  assert.throws(
    () => assertSafeWorkflow({ filename: ACTIVATION_WORKFLOW, source: base, governedSha: '0'.repeat(40) }),
    /ACTIVATION_SHA_GOVERNANCE_MISMATCH/,
  );
  assert.throws(
    () => assertSafeWorkflow({
      filename: ACTIVATION_WORKFLOW,
      source: base.replace("grant.get('revoked') is False", "grant.get('revoked') is True"),
      governedSha,
    }),
    /ACTIVATION_REVOCATION_CHECK_MISSING/,
  );
  assert.throws(
    () => assertSafeWorkflow({
      filename: ACTIVATION_WORKFLOW,
      source: `${base}\n    env:\n      ACTIVATION_SHA: \${{ github.sha }}`,
      governedSha,
    }),
    /ACTIVATION_SHA_OVERRIDE_FORBIDDEN/,
  );
});
