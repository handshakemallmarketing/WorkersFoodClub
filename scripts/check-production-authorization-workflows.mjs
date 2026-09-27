import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTIVATION_WORKFLOW = 'production-application-access-activation.yml';
export const REMOVED_AUTOMATIC_SYNC = 'production-sha-gate-sync.yml';
export const PRODUCTION_MUTATION_WORKFLOW_ALLOWLIST = new Set([
  'production-access-v2-containment.yml',
  'production-access-v2-recovery-guard.yml',
  'production-access-v2-recovery.yml',
  ACTIVATION_WORKFLOW,
  'rc2-preview-http-rehearsal.yml',
  'rc2-paystack-provider-rehearsal.yml',
  'rc3-production-identity-config-preflight.yml',
  'rc3-production-identity-rehearsal.yml',
  'rc3-residual-binding-deny-rehearsal.yml',
]);

export function mainPushTrigger(source) {
  const normalizedSource = source.replace(/^(?:'on'|"on"):/gm, 'on:');
  const inlineOn = normalizedSource.match(/^on:[ \t]*(.+)$/m)?.[1]?.trim() ?? '';
  if (inlineOn === 'push' || /^\[[^\]]*\bpush\b[^\]]*\]$/.test(inlineOn)) return true;
  if (/^\{[^}]*\bpush\s*:/.test(inlineOn)) return true;
  const onBlock = normalizedSource.match(/^on:[ \t]*\n([\s\S]*?)(?=^[A-Za-z_][A-Za-z0-9_-]*:[ \t]*(?:#.*)?$)/m)?.[1] ?? '';
  const pushMatch = onBlock.match(/^[ \t]{2}push:[ \t]*([^\n#]*)?(?:#.*)?(?:\n([\s\S]*?)(?=^[ \t]{2}[A-Za-z_][A-Za-z0-9_-]*:[ \t]*(?:#.*)?$|(?![\s\S])))?/m);
  const pushInline = pushMatch?.[1]?.trim() ?? '';
  const pushBlock = pushMatch?.[2];
  if (/^\{/.test(pushInline)) return true;
  if (pushBlock === undefined) return false;
  if (!/^\s{4}branches:/m.test(pushBlock)) return true;
  const branchLines = pushBlock.match(/^[ \t]{4}branches:[ \t]*\[[^\]]*\][ \t]*$/m)?.[0]
    ?? pushBlock.match(/^[ \t]{4}branches:[ \t]*(?:#.*)?\n(?:^[ \t]{6}-[^\n]+\n?)+/m)?.[0]
    ?? '';
  const normalized = branchLines.replace(/[\[\],]/g, ' ').split(/\s+/)
    .map((token) => token.replace(/^[-'\"]+|['\"]+$/g, ''))
    .filter(Boolean);
  return normalized.some((pattern) => pattern === 'main' || pattern.includes('*') || pattern.includes('?'));
}

export function productionMutationCapability(source) {
  return /environment:\s*(?:\n\s+name:\s*)?['"]?production['"]?/.test(source)
    || /secrets(?:\.VERCEL_TOKEN|\[['"]VERCEL_TOKEN['"]\])/.test(source)
    || /secrets:\s*inherit/.test(source)
    || /id-token:\s*write/.test(source)
    || /uses:\s*[^\n]*\.github\/workflows\//.test(source)
    || /vercel\s+(?:deploy|env)[\s\S]{0,200}--prod/.test(source)
    || /api\.vercel\.com\/v\d+\/projects\/[\s\S]{0,300}\/env/.test(source);
}

export function authorizationPinWriter(source) {
  return source.split(/\r?\n/).some((line) => {
    const trimmed = line.trim().replace(/^[-]\s+run:\s*/, '');
    const pureReadOnlyGrep = /^(?:!\s*)?grep\b/.test(trimmed) && !/[;&|`]/.test(trimmed) && !/\$\(/.test(trimmed);
    if (pureReadOnlyGrep) return false;
    return /"key"\s*:\s*"PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA"/.test(line)
      || /--env\s+PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA=/.test(line)
      || /vercel\s+env\s+(?:add|update)\s+PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA\b/.test(line);
  });
}

export function applicationAccessEnableWriter(source) {
  return source.split(/\r?\n/).some((line) => {
    const trimmed = line.trim().replace(/^[-]\s+run:\s*/, '');
    const pureReadOnlyGrep = /^(?:!\s*)?grep\b/.test(trimmed) && !/[;&|`]/.test(trimmed) && !/\$\(/.test(trimmed);
    if (pureReadOnlyGrep) return false;
    return /PRODUCTION_APPLICATION_ACCESS_ENABLED[^\n]{0,40}\btrue\b/.test(line)
      || /['"]key['"]\s*:\s*['"]PRODUCTION_APPLICATION_ACCESS_ENABLED['"][^\n]*['"]value['"]\s*:\s*['"]true['"]/.test(line);
  });
}

export function assertSafeWorkflow({ filename, source, governedSha }) {
  if (productionMutationCapability(source) && !PRODUCTION_MUTATION_WORKFLOW_ALLOWLIST.has(filename)) {
    throw new Error(`UNALLOWLISTED_PRODUCTION_MUTATION_WORKFLOW:${filename}`);
  }
  if (mainPushTrigger(source) && productionMutationCapability(source)) {
    throw new Error(`PUSH_TO_MAIN_PRODUCTION_MUTATION_FORBIDDEN:${filename}`);
  }
  if (applicationAccessEnableWriter(source)
      && filename !== ACTIVATION_WORKFLOW
      && filename !== 'production-access-v2-recovery.yml') {
    throw new Error(`UNALLOWLISTED_PRODUCTION_ACCESS_ENABLE_WRITER:${filename}`);
  }

  if (filename === 'rc2-preview-http-rehearsal.yml'
      && (/environment:\s*(?:\n\s+name:\s*)?['"]?production['"]?/.test(source)
        || /secrets(?:\.VERCEL_TOKEN|\[['"]VERCEL_TOKEN['"]\])/.test(source)
        || /secrets:\s*inherit/.test(source)
        || /uses:\s*[^\n]*\.github\/workflows\//.test(source)
        || /vercel\s+(?:deploy|env)[\s\S]{0,200}--prod/.test(source)
        || /api\.vercel\.com\/v\d+\/projects\/[\s\S]{0,300}\/env/.test(source))) {
    throw new Error(`PREVIEW_REHEARSAL_PRODUCTION_MUTATION_FORBIDDEN:${filename}`);
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
  if (!source.includes("grant.get('revoked') is False")) {
    throw new Error(`ACTIVATION_REVOCATION_CHECK_MISSING:${filename}`);
  }
  const activationShaDeclarations = source.match(/^\s+ACTIVATION_SHA:\s*.+$/gm) ?? [];
  if (activationShaDeclarations.length !== 1 || /ACTIVATION_SHA:\s*.*\$\{\{/.test(source)) {
    throw new Error(`ACTIVATION_SHA_OVERRIDE_FORBIDDEN:${filename}`);
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
  const revoked = governance?.grant?.revoked;
  if (revoked !== true && revoked !== false) {
    throw new Error('GOVERNED_PRODUCTION_AUTHORIZATION_REVOCATION_INVALID');
  }
  if (revoked === false && governance?.status !== 'ACTIVE_BOUNDED_AUTHORIZATION') {
    throw new Error('GOVERNED_PRODUCTION_AUTHORIZATION_ACTIVE_STATUS_INVALID');
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
