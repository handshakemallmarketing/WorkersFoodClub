import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MATRIX_PATH = 'docs/business-logic-v2/master-journey-truth-matrix.yaml';
const BASELINE_PATH = 'constitution/baseline.json';
const PRODUCTION_AUTHORIZATION_PATH = 'docs/governance/PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json';
const CLASSIFICATIONS = ['PROVEN', 'PARTIAL', 'UNPROVEN', 'MISSING'];

function decodeMappingKey(doubleQuoted, singleQuoted, bare) {
  const rawKey = doubleQuoted ?? singleQuoted ?? bare;
  return doubleQuoted
    ? JSON.parse(rawKey)
    : singleQuoted
      ? rawKey.slice(1, -1).replace(/''/g, "'")
      : rawKey;
}

function decodeScalar(rawValue) {
  if (rawValue === undefined) return undefined;
  if (/^"(?:[^"\\]|\\.)*"$/.test(rawValue)) return JSON.parse(rawValue);
  if (/^'(?:[^']|'')*'$/.test(rawValue)) return rawValue.slice(1, -1).replace(/''/g, "'");
  return rawValue;
}

function topLevelEntries(source) {
  const entries = [];
  const pattern = /^(?:("(?:[^"\\]|\\.)*")|('(?:[^']|'')*')|([A-Za-z_][A-Za-z0-9_-]*))[ \t]*:[ \t]*([^\n]*)$/gm;
  for (const match of source.matchAll(pattern)) {
    const key = decodeMappingKey(match[1], match[2], match[3]);
    entries.push({ key, value: match[4].trim(), start: match.index, contentStart: match.index + match[0].length + 1 });
  }
  return entries;
}

function topLevelScalar(source, key) {
  const entry = topLevelEntries(source).find((candidate) => candidate.key === key);
  return decodeScalar(entry?.value);
}

function topLevelBlock(source, key) {
  const entries = topLevelEntries(source);
  const index = entries.findIndex((entry) => entry.key === key);
  if (index === -1 || entries[index].value !== '') return '';
  return source.slice(entries[index].contentStart, entries[index + 1]?.start ?? source.length);
}

function indentedMappingEntries(source) {
  const entries = [];
  const pattern = /^  (?:("(?:[^"\\]|\\.)*")|('(?:[^']|'')*')|([A-Za-z_][A-Za-z0-9_-]*))[ \t]*:[ \t]*([^\n]*)$/gm;
  for (const match of source.matchAll(pattern)) {
    entries.push({ key: decodeMappingKey(match[1], match[2], match[3]), value: match[4].trim() });
  }
  return entries;
}

function blockRawScalar(source, key) {
  const lines = indentedMappingEntries(source).filter((entry) => entry.key === key);
  if (lines.length > 1) throw new Error(`DUPLICATE_MAPPING_KEY:${key}`);
  return lines[0]?.value;
}

function blockScalar(source, key) {
  return decodeScalar(blockRawScalar(source, key));
}

function parseFlowDocument(source) {
  let index = 0;
  const skip = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const fail = (message) => { throw new Error(`JOURNEY_FLOW_PARSE_ERROR:${message}:${index}`); };
  const quoted = () => {
    const quote = source[index];
    const start = index;
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const character = source[index];
      index += 1;
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === quote) {
        const raw = source.slice(start, index);
        if (quote === '"') return JSON.parse(raw);
        return raw.slice(1, -1).replace(/''/g, "'");
      }
    }
    fail('unterminated-string');
  };
  const bare = () => {
    const start = index;
    while (index < source.length && !/[,:{}\[\]]/.test(source[index])) index += 1;
    const value = source.slice(start, index).trim();
    if (!value) fail('empty-scalar');
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return value;
  };
  const value = () => {
    skip();
    if (source[index] === '{') return mapping();
    if (source[index] === '[') return sequence();
    if (source[index] === '"' || source[index] === "'") return quoted();
    return bare();
  };
  const sequence = () => {
    const result = [];
    index += 1;
    skip();
    if (source[index] === ']') { index += 1; return result; }
    while (index < source.length) {
      result.push(value());
      skip();
      if (source[index] === ']') { index += 1; return result; }
      if (source[index] !== ',') fail('sequence-delimiter');
      index += 1;
    }
    fail('unterminated-sequence');
  };
  const mapping = () => {
    const result = {};
    index += 1;
    skip();
    if (source[index] === '}') { index += 1; return result; }
    while (index < source.length) {
      skip();
      const key = source[index] === '"' || source[index] === "'" ? quoted() : bare();
      if (typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) fail('invalid-key');
      skip();
      if (source[index] !== ':') fail('missing-colon');
      index += 1;
      if (Object.hasOwn(result, key)) throw new Error(`DUPLICATE_JOURNEY_KEY:${key}`);
      result[key] = value();
      skip();
      if (source[index] === '}') { index += 1; return result; }
      if (source[index] !== ',') fail('mapping-delimiter');
      index += 1;
    }
    fail('unterminated-mapping');
  };
  const result = value();
  skip();
  if (index !== source.length) fail('trailing-content');
  return result;
}

function rejectDuplicateTopLevelKeys(source) {
  const seen = new Set();
  for (const { key } of topLevelEntries(source)) {
    if (seen.has(key)) throw new Error(`DUPLICATE_TOP_LEVEL_KEY:${key}`);
    seen.add(key);
  }
}

function strictTopLevelKeys(source, expectedKeys) {
  const entries = topLevelEntries(source);
  const validStarts = new Set(entries.map((entry) => entry.start));
  let offset = 0;
  for (const line of source.split(/(?<=\n)/)) {
    const text = line.replace(/\n$/, '');
    if (text && !/^\s/.test(text) && !validStarts.has(offset)) throw new Error(`INVALID_TOP_LEVEL_SYNTAX:${text.slice(0, 60)}`);
    offset += line.length;
  }
  const keys = entries.map((entry) => entry.key);
  const expected = new Set(expectedKeys);
  const unknown = keys.find((key) => !expected.has(key));
  if (unknown) throw new Error(`UNKNOWN_TOP_LEVEL_KEY:${unknown}`);
  const missing = expectedKeys.find((key) => !keys.includes(key));
  if (missing) throw new Error(`MISSING_TOP_LEVEL_KEY:${missing}`);
}

function strictBlockKeys(source, expectedKeys, blockName) {
  const entries = indentedMappingEntries(source);
  for (const line of source.split('\n')) {
    if (!line) continue;
    if (!/^  (?:("(?:[^"\\]|\\.)*")|('(?:[^']|'')*')|([A-Za-z_][A-Za-z0-9_-]*))[ \t]*:[ \t]*[^\n]*$/.test(line)) {
      throw new Error(`INVALID_${blockName.toUpperCase()}_SYNTAX:${line.slice(0, 60)}`);
    }
  }
  const keys = entries.map((entry) => entry.key);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length) throw new Error(`DUPLICATE_MAPPING_KEY:${blockName}.${duplicates[0]}`);
  const expected = new Set(expectedKeys);
  const unknown = keys.find((key) => !expected.has(key));
  if (unknown) throw new Error(`UNKNOWN_${blockName.toUpperCase()}_KEY:${unknown}`);
  const missing = expectedKeys.find((key) => !keys.includes(key));
  if (missing) throw new Error(`MISSING_${blockName.toUpperCase()}_KEY:${missing}`);
}

function durableEvidenceReference(value) {
  return typeof value === 'string' && (
    /^https:\/\/github\.com\/handshakemallmarketing\/WorkersFoodClub\/(?:actions\/runs\/\d+|pull\/\d+(?:#issuecomment-\d+)?)$/.test(value)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app\/.+/.test(value)
  );
}

function exactRcEvidenceValid(evidence, baselineSha) {
  return Array.isArray(evidence) && evidence.length > 0 && evidence.every((record) => (
    record && typeof record === 'object' && !Array.isArray(record)
    && record.commit_sha === baselineSha
    && /^[0-9a-f]{40}$/.test(record.tree_sha ?? '')
    && !/^([0-9a-f])\1{39}$/.test(record.tree_sha)
    && record.tree_sha !== record.commit_sha
    && /^dpl_[A-Za-z0-9]+$/.test(record.deployment_id ?? '')
    && /^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/.test(record.immutable_deployment_url ?? '')
    && /^https:\/\/github\.com\/handshakemallmarketing\/WorkersFoodClub\/actions\/runs\/\d+$/.test(record.ci_run_url ?? '')
    && record.ci_conclusion === 'SUCCESS'
    && record.independent_review?.verdict === 'APPROVED'
    && record.independent_review?.reviewed_commit_sha === baselineSha
    && typeof record.independent_review?.reviewer === 'string'
    && record.independent_review.reviewer.trim().length > 0
    && record.runtime_evidence && typeof record.runtime_evidence === 'object'
    && !Array.isArray(record.runtime_evidence)
    && durableEvidenceReference(record.runtime_evidence.browser)
    && durableEvidenceReference(record.runtime_evidence.api)
    && durableEvidenceReference(record.runtime_evidence.postgresql)
    && durableEvidenceReference(record.runtime_evidence.provider)
  ));
}

export function validateJourneyTruthMatrix({ matrixSource, baseline, productionAuthorization, corpusExists }) {
  rejectDuplicateTopLevelKeys(matrixSource);
  strictTopLevelKeys(matrixSource, [
    'version', 'status', 'as_of_utc', 'repository', 'baseline_sha', 'owner',
    'reconciliation_scope', 'classification_rule', 'summary', 'global_safety_boundary',
    'global_gaps', 'field_legend', 'journeys',
  ]);
  if (topLevelScalar(matrixSource, 'status') !== 'WORKING_BASELINE_NOT_LAUNCH_AUTHORIZATION') {
    throw new Error('JOURNEY_MATRIX_STATUS_MUST_NOT_AUTHORIZE_LAUNCH');
  }
  if (!/^20\d\d-\d\d-\d\d$/.test(topLevelScalar(matrixSource, 'as_of_utc') ?? '')) {
    throw new Error('JOURNEY_MATRIX_AS_OF_INVALID');
  }
  if (!/^[0-9a-f]{40}$/.test(topLevelScalar(matrixSource, 'baseline_sha') ?? '')) {
    throw new Error('JOURNEY_MATRIX_BASELINE_SHA_INVALID');
  }
  if (baseline?.status !== 'RATIFIED' || baseline?.ratification_authority !== 'System Owner') {
    throw new Error('CONSTITUTIONAL_RATIFICATION_NOT_PROVEN');
  }
  if (baseline?.substantive_corpus_path !== 'constitution/WORKERSFOODCLUB_CONSTITUTION_V1.md' || !corpusExists) {
    throw new Error('CONSTITUTIONAL_SOURCE_NOT_PROVEN');
  }

  const summarySource = topLevelBlock(matrixSource, 'summary');
  const safetySource = topLevelBlock(matrixSource, 'global_safety_boundary');
  const summaryKeys = [...CLASSIFICATIONS, 'FUTURE_NOT_REQUIRED_FOR_INITIAL_LAUNCH'];
  strictBlockKeys(summarySource, summaryKeys, 'summary');
  const safetyKeys = [
    'paystack_live_mode',
    'live_paystack_credentials',
    'live_funds',
    'production_application_access',
    'standing_governed_production_sha',
    'matrix_baseline_production_authorized',
    'production_payment_mutations',
    'production_refund_mutations',
    'production_fulfillment_mutations',
    'production_credit_mutations',
    'production_payroll_cagd_mutations',
  ];
  strictBlockKeys(safetySource, safetyKeys, 'safety_boundary');
  for (const key of safetyKeys.filter((key) => !['standing_governed_production_sha', 'matrix_baseline_production_authorized'].includes(key))) {
    if (blockScalar(safetySource, key) !== 'WITHHELD') throw new Error(`AUTHORITY_WIDENING_FORBIDDEN:${key}`);
  }
  const governedSha = productionAuthorization?.grant?.candidateSha;
  const baselineSha = topLevelScalar(matrixSource, 'baseline_sha');
  if (!/^[0-9a-f]{40}$/.test(governedSha ?? '')
      || blockScalar(safetySource, 'standing_governed_production_sha') !== governedSha) {
    throw new Error('STANDING_PRODUCTION_SHA_TRUTH_INVALID');
  }
  if (blockScalar(safetySource, 'matrix_baseline_production_authorized') !== 'false'
      || baselineSha === governedSha) {
    throw new Error('MATRIX_BASELINE_PRODUCTION_AUTHORITY_INVALID');
  }

  const journeysSource = topLevelBlock(matrixSource, 'journeys');
  if (!journeysSource) throw new Error('JOURNEYS_SECTION_MISSING');
  for (const line of journeysSource.split('\n')) {
    const canonicalLine = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (canonicalLine && !/^ {2}- \{.*\}[ \t]*$/.test(canonicalLine)) {
      throw new Error(`INVALID_JOURNEY_SYNTAX:${canonicalLine.slice(0, 60)}`);
    }
  }
  const journeySources = [...journeysSource.matchAll(/^ {2}- (\{.*\})\s*$/gm)].map((match) => match[1]);
  const journeys = journeySources.map((source) => ({ ...parseFlowDocument(source), source }));
  if (journeys.length !== 30) throw new Error(`JOURNEY_COUNT_INVALID:${journeys.length}`);
  const ids = new Set(journeys.map((journey) => journey.id));
  for (let number = 1; number <= 30; number += 1) {
    const id = `UC-${String(number).padStart(2, '0')}`;
    if (!ids.has(id)) throw new Error(`JOURNEY_MISSING:${id}`);
  }
  if (ids.size !== journeys.length) throw new Error('JOURNEY_ID_DUPLICATE');

  const counts = Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, 0]));
  for (const journey of journeys) {
    if (!Object.hasOwn(counts, journey.classification)) throw new Error(`JOURNEY_CLASSIFICATION_INVALID:${journey.id}`);
    counts[journey.classification] += 1;
    if (journey.classification === 'PROVEN' && !exactRcEvidenceValid(journey.exact_rc_evidence, baselineSha)) {
      throw new Error(`PROVEN_WITHOUT_EXACT_RC_EVIDENCE:${journey.id}`);
    }
  }
  for (const journey of journeys) {
    if (!Array.isArray(journey.dependencies)) throw new Error(`JOURNEY_DEPENDENCIES_INVALID:${journey.id}`);
    if (new Set(journey.dependencies).size !== journey.dependencies.length) throw new Error(`JOURNEY_DEPENDENCY_DUPLICATE:${journey.id}`);
    for (const dependency of journey.dependencies) {
      if (typeof dependency !== 'string' || !ids.has(dependency)) throw new Error(`JOURNEY_DEPENDENCY_UNKNOWN:${journey.id}:${dependency}`);
      if (dependency === journey.id) throw new Error(`JOURNEY_DEPENDENCY_CYCLE:${journey.id}`);
    }
  }
  const byId = new Map(journeys.map((journey) => [journey.id, journey]));
  const visiting = new Set(), visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`JOURNEY_DEPENDENCY_CYCLE:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  for (const classification of CLASSIFICATIONS) {
    const rawDeclared = blockRawScalar(summarySource, classification);
    if (!/^(?:0|[1-9][0-9]*)$/.test(rawDeclared ?? '')) {
      throw new Error(`JOURNEY_SUMMARY_VALUE_INVALID:${classification}`);
    }
    const declared = Number(rawDeclared);
    if (declared !== counts[classification]) {
      throw new Error(`JOURNEY_SUMMARY_MISMATCH:${classification}:${declared}:${counts[classification]}`);
    }
  }
  if (blockRawScalar(summarySource, 'FUTURE_NOT_REQUIRED_FOR_INITIAL_LAUNCH') !== '0') {
    throw new Error('FUTURE_NOT_REQUIRED_COUNT_UNSUPPORTED');
  }
  // This offline repository gate can reject malformed evidence, but it cannot prove
  // that a remote CI run, deployment, reviewer, provider event, or database trace is
  // genuine. Until a dedicated online certification gate verifies those identities,
  // no journey may be promoted to PROVEN through a self-asserted matrix edit.
  if (counts.PROVEN !== 0) {
    throw new Error('PROVEN_REQUIRES_ONLINE_INDEPENDENT_CERTIFICATION_GATE');
  }

  const uc08 = journeys.find((journey) => journey.id === 'UC-08') ?? {};
  if (uc08.classification !== 'UNPROVEN'
      || uc08.severity !== 'P0'
      || uc08.launch_requirement !== 'REQUIRED'
      || JSON.stringify(uc08.dependencies) !== JSON.stringify(['UC-07'])
      || JSON.stringify(uc08.policy_evidence) !== JSON.stringify(['BLV2-DEC-024', 'PR-15', 'PR-16', 'PR-17', 'PR-18'])
      || JSON.stringify(uc08.authorization_scopes) !== JSON.stringify(['member:payment.execute'])
      || uc08.final_disposition !== 'IMPLEMENTATION_EVIDENCE_OPEN_PRODUCTION_WITHHELD'
      || JSON.stringify(uc08.production_evidence) !== JSON.stringify(['mutations withheld'])) {
    throw new Error('UC08_FAIL_CLOSED_BOUNDARY_INVALID');
  }
  const uc10 = journeys.find((journey) => journey.id === 'UC-10') ?? {};
  if (uc10.dependencies?.join(',') !== 'UC-08,UC-09'
      || uc10.classification !== 'PARTIAL'
      || uc10.severity !== 'P0'
      || uc10.launch_requirement !== 'REQUIRED'
      || JSON.stringify(uc10.authorization_scopes) !== JSON.stringify(['operator:fulfillment.manage'])
      || JSON.stringify(uc10.authorized_operator_tiers) !== JSON.stringify(['FULFILLMENT_CAPABLE_OPERATORS'])
      || JSON.stringify(uc10.production_evidence) !== JSON.stringify(['mutations withheld'])
      || uc10.final_disposition !== 'DEPENDENCY_BLOCKED') {
    throw new Error('UC10_DEPENDENCY_BOUNDARY_INVALID');
  }
  return { counts, baselineSha: topLevelScalar(matrixSource, 'baseline_sha') };
}

export function checkJourneyTruthMatrix(root = process.cwd()) {
  const matrixSource = fs.readFileSync(path.join(root, MATRIX_PATH), 'utf8');
  const baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE_PATH), 'utf8'));
  const productionAuthorization = JSON.parse(fs.readFileSync(path.join(root, PRODUCTION_AUTHORIZATION_PATH), 'utf8'));
  const corpusExists = fs.existsSync(path.join(root, baseline.substantive_corpus_path ?? ''));
  return validateJourneyTruthMatrix({ matrixSource, baseline, productionAuthorization, corpusExists });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = checkJourneyTruthMatrix();
  console.log(`journey truth matrix verified: ${JSON.stringify(result.counts)}; baseline ${result.baselineSha}`);
}
