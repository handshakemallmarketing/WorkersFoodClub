import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivacyRetentionPolicy,PrivacyExportGate} from '../../dist/packages/production-readiness/src/index.js';

test('RC2 privacy registry defines every material class with explicit disposition',()=>{
 const policy=new PrivacyRetentionPolicy();
 const all=policy.all();
 assert.ok(all.length>=8);
 for(const item of all){
  assert.ok(item.dataClass);
  assert.ok(item.purpose);
  assert.ok(['PUBLIC','INTERNAL','PERSONAL','SENSITIVE'].includes(item.sensitivity));
  assert.ok(['DELETE','TOMBSTONE','RETAIN_CANONICAL'].includes(item.disposition));
  assert.ok(item.retentionDays===null||Number.isInteger(item.retentionDays));
  assert.ok(Object.isFrozen(item));
 }
});

test('RC2 raw eligibility documents and secrets cannot enter broad projections or logs',()=>{
 const policy=new PrivacyRetentionPolicy();
 for(const dataClass of ['ELIGIBILITY_DOCUMENT_RAW','SECRET_CREDENTIAL']){
  assert.throws(()=>policy.assertProjectionAllowed(dataClass),new RegExp(`DATA_CLASS_FORBIDDEN_IN_BROAD_PROJECTION:${dataClass}`));
  assert.throws(()=>policy.assertOperationalLogAllowed(dataClass),new RegExp(`DATA_CLASS_FORBIDDEN_IN_OPERATIONAL_LOG:${dataClass}`));
 }
 assert.doesNotThrow(()=>policy.assertProjectionAllowed('PARTICIPANT_OPERATIONAL_ID'));
 assert.doesNotThrow(()=>policy.assertOperationalLogAllowed('AUDIT_METADATA'));
});

test('RC2 retention never silently deletes canonical financial or physical evidence',()=>{
 const policy=new PrivacyRetentionPolicy();
 assert.equal(policy.disposition('PAYMENT_EVIDENCE',10000),'RETAIN_CANONICAL');
 assert.equal(policy.disposition('INVENTORY_FULFILLMENT_EVIDENCE',10000),'RETAIN_CANONICAL');
 assert.equal(policy.disposition('ELIGIBILITY_DOCUMENT_RAW',29),'RETAIN_UNTIL_DUE');
 assert.equal(policy.disposition('ELIGIBILITY_DOCUMENT_RAW',30),'DELETE');
 assert.equal(policy.disposition('ELIGIBILITY_EVIDENCE_REFERENCE',365),'TOMBSTONE');
});

test('RC2 privacy-sensitive exports require actor scope and purpose, and secrets are never exportable',()=>{
 const gate=new PrivacyExportGate();
 assert.throws(()=>gate.authorize({dataClass:'PAYMENT_EVIDENCE',actorScoped:false,purpose:'member support'}),/PRIVACY_EXPORT_SCOPE_REQUIRED/);
 assert.throws(()=>gate.authorize({dataClass:'PAYMENT_EVIDENCE',actorScoped:true,purpose:''}),/PRIVACY_EXPORT_PURPOSE_REQUIRED/);
 assert.throws(()=>gate.authorize({dataClass:'SECRET_CREDENTIAL',actorScoped:true,purpose:'debug'}),/SECRET_EXPORT_FORBIDDEN/);
 const result=gate.authorize({dataClass:'PAYMENT_EVIDENCE',actorScoped:true,purpose:'member dispute reconciliation'});
 assert.equal(result.authorized,true);
 assert.ok(Object.isFrozen(result));
});
