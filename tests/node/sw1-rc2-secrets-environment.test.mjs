import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeConfigurationGate,SafeOperationalLogger} from '../../dist/packages/production-readiness/src/index.js';

const production={
 environment:'production',
 paymentProvider:'MTN_MOMO_GH_PROD',
 webhookSecret:'prod-webhook-secret',
 databaseUrl:'postgres://prod-db.internal/foodclub',
 observabilityToken:'obs-prod-token'
};

test('RC2 runtime configuration fails closed on ambiguous or missing production configuration',()=>{
 const gate=new RuntimeConfigurationGate();
 assert.throws(()=>gate.validate({...production,environment:undefined}),/RUNTIME_ENVIRONMENT_REQUIRED/);
 assert.throws(()=>gate.validate({...production,environment:'prod'}),/RUNTIME_ENVIRONMENT_INVALID/);
 assert.throws(()=>gate.validate({...production,paymentProvider:''}),/PAYMENT_PROVIDER_CONFIGURATION_REQUIRED/);
 assert.throws(()=>gate.validate({...production,webhookSecret:''}),/PAYMENT_WEBHOOK_SECRET_REQUIRED/);
 assert.throws(()=>gate.validate({...production,databaseUrl:''}),/DATABASE_URL_REQUIRED/);
});

test('RC2 production configuration forbids sandbox provider and non-production database targets',()=>{
 const gate=new RuntimeConfigurationGate();
 assert.throws(()=>gate.validate({...production,paymentProvider:'SANDBOX_MOMO'}),/SANDBOX_PROVIDER_FORBIDDEN_IN_PRODUCTION/);
 assert.throws(()=>gate.validate({...production,databaseUrl:'postgres://localhost/foodclub'}),/NON_PRODUCTION_DATABASE_FORBIDDEN_IN_PRODUCTION/);
 assert.throws(()=>gate.validate({...production,databaseUrl:'postgres://db.internal/foodclub-test'}),/NON_PRODUCTION_DATABASE_FORBIDDEN_IN_PRODUCTION/);
});

test('RC2 non-production environments cannot silently bind a live provider',()=>{
 const gate=new RuntimeConfigurationGate();
 for(const environment of ['development','test','staging']){
  assert.throws(()=>gate.validate({...production,environment,paymentProvider:'MTN_MOMO_GH_PROD'}),/LIVE_PROVIDER_FORBIDDEN_OUTSIDE_PRODUCTION/);
  assert.doesNotThrow(()=>gate.validate({...production,environment,paymentProvider:'SANDBOX_MOMO',databaseUrl:'postgres://localhost/foodclub'}));
 }
});

test('RC2 validated runtime configuration is immutable',()=>{
 const gate=new RuntimeConfigurationGate();
 const config=gate.validate(production);
 assert.ok(Object.isFrozen(config));
 assert.equal(config.environment,'production');
 assert.equal(config.paymentProvider,'MTN_MOMO_GH_PROD');
});

test('RC2 operational logging redacts secrets and sensitive verification payloads recursively',()=>{
 const logger=new SafeOperationalLogger();
 const secret='PLANTED_SECRET_MARKER_9217';
 const sensitive='PLANTED_SENSITIVE_MARKER_7721';
 const event={
  kind:'PAYMENT_WEBHOOK_FAILURE',
  authorization:`Bearer ${secret}`,
  nested:{webhookSecret:secret,api_key:secret,nationalId:sensitive,verification_document:{raw:sensitive}},
  safe:{providerReference:'mtn-ref-123',status:'FAILED'}
 };
 const recorded=logger.record(event);
 const serialized=JSON.stringify(recorded);
 assert.equal(serialized.includes(secret),false);
 assert.equal(serialized.includes(sensitive),false);
 assert.equal(serialized.includes('[REDACTED]'),true);
 assert.equal(recorded.safe.providerReference,'mtn-ref-123');
 assert.ok(Object.isFrozen(recorded));
 assert.ok(Object.isFrozen(recorded.nested));
});
