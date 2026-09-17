import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const api=await readFile(new URL('../../api/product-request-survey.js',import.meta.url),'utf8');
const sql=await readFile(new URL('../../packages/durability/sql/012_wave2_engagement.sql',import.meta.url),'utf8');
test('UC-14 survey is hard classified NON_COMMITMENT',()=>{assert.match(sql,/CHECK \(economic_classification = 'NON_COMMITMENT'\)/);assert.match(api,/'NON_COMMITMENT'/);});
test('UC-14 survey endpoint cannot write commerce truth',()=>{for(const forbidden of ['preview_member_commitment','preview_member_obligation','preview_member_offer','PURCHASE_COMMITTED'])assert.equal(api.includes(forbidden),false,forbidden);});
test('UC-14 survey replay is participant-bound and rebound fails closed',()=>{assert.match(sql,/UNIQUE \(participant_id, idempotency_key\)/);assert.match(api,/SURVEY_REQUEST_REBOUND/);assert.match(api,/error\?\.code==='23505'/);});
test('UC-14 survey remains disabled for Production writes',()=>{assert.match(api,/SURVEY_WRITE_DISABLED_IN_PRODUCTION/);});
