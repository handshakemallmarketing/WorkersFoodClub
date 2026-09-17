import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validPreference} from '../../api/product-request-survey.js';
const api=await readFile(new URL('../../api/product-request-survey.js',import.meta.url),'utf8');
const sql=await readFile(new URL('../../packages/durability/sql/012_wave2_engagement.sql',import.meta.url),'utf8');
test('UC-14 survey is hard classified NON_COMMITMENT',()=>{assert.match(sql,/CHECK \(economic_classification = 'NON_COMMITMENT'\)/);assert.match(api,/'NON_COMMITMENT'/);});
test('UC-14 survey endpoint cannot write commerce truth',()=>{for(const forbidden of ['preview_member_commitment','preview_member_obligation','preview_member_offer','PURCHASE_COMMITTED'])assert.equal(api.includes(forbidden),false,forbidden);});
test('UC-14 survey replay is participant-bound and changed payload fails closed',()=>{assert.match(sql,/UNIQUE \(participant_id, idempotency_key\)/);assert.match(api,/sameCommand\(prior\[0\],subject,preference\)/);assert.match(api,/canonicalJson\(row\.preference_json\?\?\{\}\)===canonicalJson\(preference\)/);assert.match(api,/SURVEY_REQUEST_REBOUND/);assert.match(api,/error\?\.code==='23505'/);});
test('UC-14 survey remains disabled for Production writes',()=>{assert.match(api,/SURVEY_WRITE_DISABLED_IN_PRODUCTION/);});

// Real behavioral verification of validPreference(), not just a source-text check.
test('UC-14 preference within bounds is accepted',()=>{assert.equal(validPreference({}),true);assert.equal(validPreference({brand:'local',quantity:5,inStock:true}),true);});
test('UC-14 preference with too many keys is rejected',()=>{const tooMany=Object.fromEntries(Array.from({length:21},(_,i)=>[`k${i}`,i]));assert.equal(validPreference(tooMany),false);const atLimit=Object.fromEntries(Array.from({length:20},(_,i)=>[`k${i}`,i]));assert.equal(validPreference(atLimit),true);});
test('UC-14 preference with a nested object or array value is rejected',()=>{assert.equal(validPreference({nested:{a:1}}),false);assert.equal(validPreference({nested:[1,2,3]}),false);});
test('UC-14 preference exceeding serialized length is rejected',()=>{assert.equal(validPreference({note:'x'.repeat(2001)}),false);assert.equal(validPreference({note:'x'.repeat(10)}),true);});
