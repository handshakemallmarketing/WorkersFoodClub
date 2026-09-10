import test from 'node:test';
import assert from 'node:assert/strict';
import {ConsequentialObservability} from '../../dist/packages/production-readiness/src/index.js';

test('RC2 observability classifies material consequential failures and alerts',()=>{
 const obs=new ConsequentialObservability();
 const critical=obs.emit({kind:'PAYMENT_RECONCILIATION_AMBIGUOUS',occurredAt:'2026-09-10T15:20:00Z',correlationId:'payment:mtn:1',detail:{providerReference:'mtn-1'}});
 const warning=obs.emit({kind:'AUTHORIZATION_FAILURE',occurredAt:'2026-09-10T15:20:01Z',correlationId:'auth:1',detail:{action:'refund.complete'}});
 assert.equal(critical.severity,'CRITICAL');
 assert.equal(warning.severity,'WARNING');
 assert.equal(obs.alerts().length,2);
 assert.ok(Object.isFrozen(obs.all()));
 assert.ok(Object.isFrozen(obs.alerts()));
});

test('RC2 observability redacts planted secret and sensitive markers before storage',()=>{
 const obs=new ConsequentialObservability();
 const secret='PLANTED_OBS_SECRET_4422';
 const sensitive='PLANTED_OBS_SENSITIVE_8899';
 const signal=obs.emit({
  kind:'PAYMENT_VERIFICATION_FAILURE',
  occurredAt:'2026-09-10T15:21:00Z',
  correlationId:'webhook:attack-1',
  detail:{authorization:`Bearer ${secret}`,nested:{webhook_secret:secret,verificationDocument:sensitive},providerReference:'safe-ref'}
 });
 const serialized=JSON.stringify(signal);
 assert.equal(serialized.includes(secret),false);
 assert.equal(serialized.includes(sensitive),false);
 assert.equal(serialized.includes('safe-ref'),true);
 assert.equal(serialized.includes('[REDACTED]'),true);
});

test('RC2 observability requires valid time and attributable correlation id',()=>{
 const obs=new ConsequentialObservability();
 assert.throws(()=>obs.emit({kind:'COMMAND_FAILURE',occurredAt:'not-a-time',correlationId:'cmd:1'}),/OBSERVABILITY_TIME_INVALID/);
 assert.throws(()=>obs.emit({kind:'COMMAND_FAILURE',occurredAt:'2026-09-10T15:22:00Z',correlationId:' '}),/OBSERVABILITY_CORRELATION_ID_REQUIRED/);
});
