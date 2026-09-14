import assert from 'node:assert/strict';

const rawBase = process.env.PRODUCTION_BASE_URL?.replace(/\/$/, '');
const expectedSha = process.env.EXPECTED_COMMIT_SHA;
const memberToken = process.env.RC3_PRODUCTION_MEMBER_TOKEN;
const operatorToken = process.env.RC3_PRODUCTION_OPERATOR_TOKEN;
const expectedMemberActorId = process.env.RC3_EXPECTED_MEMBER_ACTOR_ID;
const expectedOperatorActorId = process.env.RC3_EXPECTED_OPERATOR_ACTOR_ID;

if (!rawBase) throw new Error('PRODUCTION_BASE_URL required');
if (!expectedSha) throw new Error('EXPECTED_COMMIT_SHA required');
if (!memberToken) throw new Error('RC3_PRODUCTION_MEMBER_TOKEN required');
if (!operatorToken) throw new Error('RC3_PRODUCTION_OPERATOR_TOKEN required');
if (!expectedMemberActorId) throw new Error('RC3_EXPECTED_MEMBER_ACTOR_ID required');
if (!expectedOperatorActorId) throw new Error('RC3_EXPECTED_OPERATOR_ACTOR_ID required');
assert.match(expectedSha, /^[0-9a-f]{40}$/, 'EXPECTED_COMMIT_SHA must be a full 40-character Git SHA');

const target = new URL(rawBase);
assert.equal(target.protocol, 'https:', 'PRODUCTION_BASE_URL must use https');
assert.equal(target.pathname, '/', 'PRODUCTION_BASE_URL must be an origin without a path');
assert.equal(target.search, '', 'PRODUCTION_BASE_URL must not contain a query string');
assert.equal(target.hash, '', 'PRODUCTION_BASE_URL must not contain a fragment');
const base = target.origin;

async function json(path, { token, method = 'GET', body } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text.slice(0, 300) }; }
  return { status: response.status, body: parsed, headers: response.headers };
}

// Authentication boundary: no token and malformed token must fail closed.
const unauthenticated = await json('/api/member-notifications');
assert.equal(unauthenticated.status, 401, `unauthenticated production read must fail 401; got ${unauthenticated.status}`);

const malformed = await json('/api/member-notifications', { token: 'not-a-jwt' });
assert.equal(malformed.status, 401, `malformed production bearer must fail 401; got ${malformed.status}`);

// Application authority boundary: a member principal must not acquire operator authority,
// and an operator principal must not acquire member authority merely from a valid JWT.
const memberEscalation = await json('/api/operator-orders', { token: memberToken });
assert.equal(memberEscalation.status, 403, `member-to-operator escalation must fail 403; got ${memberEscalation.status}`);
assert.equal(memberEscalation.body?.error, 'AUTHORIZATION_SCOPE_REQUIRED');

const operatorEscalation = await json('/api/member-notifications', { token: operatorToken });
assert.equal(operatorEscalation.status, 403, `operator-to-member escalation must fail 403; got ${operatorEscalation.status}`);
assert.equal(operatorEscalation.body?.error, 'AUTHORIZATION_SCOPE_REQUIRED');

// Positive paths prove server-side (issuer, subject) -> canonical actor binding.
const member = await json('/api/member-notifications', { token: memberToken });
assert.equal(member.status, 200, `bound production member read must succeed; got ${member.status} ${JSON.stringify(member.body)}`);
assert.equal(member.body?.ok, true);
assert.equal(member.body?.memberId, expectedMemberActorId, 'member canonical actor must come from application binding');
assert.ok(Array.isArray(member.body?.notifications));

const operator = await json('/api/operator-orders', { token: operatorToken });
assert.equal(operator.status, 200, `bound production operator read must succeed; got ${operator.status} ${JSON.stringify(operator.body)}`);
assert.equal(operator.body?.ok, true);
assert.equal(operator.body?.operatorActorId, expectedOperatorActorId, 'operator canonical actor must come from application binding');
assert.ok(Array.isArray(operator.body?.orders));

// Consequential Preview/sandbox mutations must stay disabled in Production regardless
// of caller authority. No real provider transaction is attempted by this rehearsal.
for (const path of ['/api/commit-sandbox', '/api/pay-sandbox', '/api/fulfillment-ready', '/api/authorize-refund', '/api/complete-refund']) {
  const response = await json(path, {
    token: path.includes('commit') || path.includes('pay') ? memberToken : operatorToken,
    method: 'POST',
    body: { obligationId: 'wfc:obligation:rehearsal', requestId: '00000000-0000-4000-8000-000000000001' },
  });
  assert.equal(response.status, 403, `${path} must remain production-disabled; got ${response.status}`);
}

console.log(JSON.stringify({
  ok: true,
  target: base,
  expectedCommitSha: expectedSha,
  liveFundsAuthorized: false,
  assertions: [
    'unauthenticated-production-read-denied',
    'malformed-bearer-denied',
    'member-cannot-escalate-to-operator',
    'operator-cannot-escalate-to-member',
    'member-canonical-actor-resolved-server-side',
    'operator-canonical-actor-resolved-server-side',
    'production-sandbox-mutations-denied',
  ],
}, null, 2));
