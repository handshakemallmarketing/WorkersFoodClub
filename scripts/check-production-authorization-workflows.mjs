import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTIVATION_WORKFLOW = 'production-application-access-activation.yml';
export const REMOVED_AUTOMATIC_SYNC = 'production-sha-gate-sync.yml';

export function mainPushTrigger(source) {
  const inlineOn = source.match(/^on:\s*(.+)$/m)?.[1]?.trim() ?? '';
  if (inlineOn === 'push' || /^\[[^\]]*\bpush\b[^\]]*\]$/.test(inlineOn)) return true;
  const onBlock = source.match(/^on:\s*\n([\s\S]*?)(?=^[A-Za-z_][A-Za-z0-9_-]*:\s*(?:#.*)?$)/m)?.[1] ?? '';
  const pushBlock = onBlock.match(/^\s{2}push:\s*(?:#.*)?\n([\s\S]*?)(?=^\s{2}[A-Za-z_][A-Za-z0-9_-]*:\s*(?:#.*)?$|(?![\s\S]))/m)?.[1];
  if (pushBlock === undefined) return false;
  if (!/^\s{4}branches:/m.test(pushBlock)) return true;
  return /^\s{4}branches:\s*\[[^\]]*\bmain\b[^\]]*\]\s*$/m.test(pushBlock)
    || /^\s{6}-\s*main\s*$/m.test(pushBlock);
}

export function productionMutationCapability(source) {
  return /environment:\s*production/.test(source)
    || /secrets\.VERCEL_TOKEN/.test(source)
    || /vercel\s+deploy[^\n]*--prod/.test(source)
    || /api\.vercel\.com\/v\d+\/projects\/[^\n]*\/env/.test(source);
}

export function authorizationPinWriter(source) {
  return source.split(/\r?\n/).some((line) => !/\bgrep\b/.test(line)
    && (/"key"\s*:\s*"PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA"/.test(line)
      || /--env\s+PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA=/.test(line)));
}

export function assertSafeWorkflow({ filename, source, governedSha }) {
  if (mainPushTrigger(source) && productionMutationCapability(source)) {
    throw new Error(`PUSH_TO_MAIN_PRODUCTION_MUTATION_FORBIDDEN:${filename}`);
  }

  if (!authorizationPinWriter(source)) return;
  if (filename !== ACTIVATION_WORKFLOW) {
    throw new Error(`UNALLOWLISTED_PRODUCTION_AUTHORIZATION_WRITER:${filename}`);
  }

  const fixedCandidate = source.match(/^\s{6}ACTIVATION_SHA:\s*['"]?([0-9a-f]{40})['"]?\s*$/m)?.[1];
  if (fixedCandidate !== governedSha) {
    throw new Error(`ACTIVATION_SHA_GOVERNANCE_MISMATCH:${filename}`);
  }
  if (!source.includes("grant.get('candidateSha') == os.environ['ACTIVATION_SHA']")) {
    throw new Error(`ACTIVATION_GOVERNANCE_COMPARISON_MISSING:${filename}`);
  }
  if (!source.includes('--arg sha "$ACTIVATION_SHA"')
      || !source.includes('--env PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA="$ACTIVATION_SHA"')) {
    throw new Error(`ACTIVATION_FIXED_CANDIDATE_WRITE_MISSING:${filename}`);
  }
  for (const line of source.split(/\r?\n/)) {
    if (/\bgrep\b/.test(line)) continue;
    if (/--arg\s+sha\b/.test(line) && !line.includes('--arg sha "$ACTIVATION_SHA"')) {
      throw new Error(`NON_GOVERNED_PRODUCTION_AUTHORIZATION_CANDIDATE:${filename}`);
    }
    if (/--env\s+PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA=/.test(line)
        && !line.includes('--env PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA="$ACTIVATION_SHA"')) {
      throw new Error(`NON_GOVERNED_PRODUCTION_AUTHORIZATION_CANDIDATE:${filename}`);
    }
  }
}

export async function checkProductionAuthorizationWorkflows(root = process.cwd()) {
  const workflowDirectory = path.join(root, '.github/workflows');
  const governancePath = path.join(root, 'docs/governance/PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json');
  const governance = JSON.parse(await readFile(governancePath, 'utf8'));
  const governedSha = governance?.grant?.candidateSha;
  if (!/^[0-9a-f]{40}$/.test(governedSha ?? '')) {
    throw new Error('GOVERNED_PRODUCTION_AUTHORIZATION_SHA_INVALID');
  }
  if (governance?.grant?.revoked !== false || governance?.status !== 'ACTIVE_BOUNDED_AUTHORIZATION') {
    throw new Error('GOVERNED_PRODUCTION_AUTHORIZATION_NOT_ACTIVE');
  }

  const workflowFiles = (await readdir(workflowDirectory))
    .filter((filename) => filename.endsWith('.yml') || filename.endsWith('.yaml'))
    .sort();
  if (workflowFiles.includes(REMOVED_AUTOMATIC_SYNC)) {
    throw new Error(`AUTOMATIC_PRODUCTION_SHA_SYNC_FORBIDDEN:${REMOVED_AUTOMATIC_SYNC}`);
  }

  for (const filename of workflowFiles) {
    const source = await readFile(path.join(workflowDirectory, filename), 'utf8');
    assertSafeWorkflow({ filename, source, governedSha });
  }
  return { workflowCount: workflowFiles.length, governedSha };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await checkProductionAuthorizationWorkflows();
  console.log(`Production authorization workflow policy verified: ${result.workflowCount} workflows; governed SHA ${result.governedSha}`);
}
