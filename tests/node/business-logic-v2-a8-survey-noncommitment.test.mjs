import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const api=await readFile(new URL('../../api/product-request-survey.js',import.meta.url),'utf8');
const sql=await readFile(new URL('../../packages/durability/sql/012_wave2_engagement.sql',import.meta.url),'utf8');
test('UC-14 survey is hard classified NON_COMMITMENT',()=>{assert.match(sql,/CHECK \(economic_classification = 'NON_COMMITMENT'\)/);assert.match(api,/'NON_COMMITMENT'/);});
test('UC-14 survey endpoint cannot write commerce truth',()=>{for(const forbidden of ['preview_member_commitment','preview_member_obligation','preview_member_offer','PURCHASE_COMMITTED'])assert.equal(api.includes(forbidden),false,forbidden);});
test('UC-14 survey replay is participant-bound and changed payload fails closed',()=>{assert.match(sql,/UNIQUE \(participant_id, idempotency_key\)/);assert.match(api,/sameCommand\(prior\[0\],subject,preference\)/);assert.match(api,/canonicalJson\(row\.preference_json\?\?\{\}\)===canonicalJson\(preference\)/);assert.match(api,/SURVEY_REQUEST_REBOUND/);assert.match(api,/error\?\.code==='23505'/);});
test('UC-14 survey remains disabled for Production writes',()=>{assert.match(api,/SURVEY_WRITE_DISABLED_IN_PRODUCTION/);});
test('UC-14 survey preference field is bounded in size and shape',()=>{assert.match(api,/MAX_PREFERENCE_KEYS=20/);assert.match(api,/MAX_PREFERENCE_JSON_LENGTH=2000/);assert.match(api,/typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean'/);assert.match(api,/PREFERENCE_INVALID/);});

// Real behavioral verification of validPreference(), not just a source-text check.
const mod = await import('../../api/product-request-survey.js');
async function invokeValidatorViaHandler(preference) {
  const req = { method: 'POST', headers: {}, body: { requestId: '11111111-1111-4111-8111-111111111111', subject: 'rice', preference } };
  let statusCode; let payload;
  const res = {
    setHeader() { return res; },
    status(code) { statusCode = code; return res; },
    json(body) { payload = body; return res; },
  };
  await mod.default(req, res);
  return { statusCode, payload };
}
test('UC-14 oversized preference is rejected before any database call (behavioral)', async () => {
  const tooManyKeys = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
  const { statusCode, payload } = await invokeValidatorViaHandler(tooManyKeys);
  assert.equal(statusCode, 400);
  assert.equal(payload.error, 'PREFERENCE_INVALID');
});
test('UC-14 nested-object preference values are rejected (behavioral)', async () => {
  const { statusCode, payload } = await invokeValidatorViaHandler({ nested: { a: 1 } });
  assert.equal(statusCode, 400);
  assert.equal(payload.error, 'PREFERENCE_INVALID');
});
