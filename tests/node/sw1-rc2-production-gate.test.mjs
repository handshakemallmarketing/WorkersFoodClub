import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionReadinessGate} from '../../dist/packages/production-readiness/src/index.js';

const domains=['AUTHORIZATION','PRIVACY_RETENTION','SECRETS_ENVIRONMENT','PAYMENT_PROVIDER','BACKUP_RESTORE','OBSERVABILITY','RUNBOOKS','TITLE_RISK_POLICY','ADVERSARIAL_REHEARSAL'];
const evidence=domains.map(domain=>({domain,status:'PASS',evidenceRef:`evidence:${domain}`,detail:domain==='PAYMENT_PROVIDER'?'provider=MTN_MOMO_GH_PROD':domain==='TITLE_RISK_POLICY'?'policy=GH-PILOT-TITLE-RISK-v1':'verified'}));
const envelope={environment:'production',provider:'MTN_MOMO_GH_PROD',policyVersion:'GH-PILOT-TITLE-RISK-v1',reviewedCommit:'abc123'};

test('RC2 production gate fails closed on every missing readiness domain',()=>{
 const gate=new ProductionReadinessGate();
 for(const domain of domains){
  assert.throws(()=>gate.authorize({envelope,evidence:evidence.filter(e=>e.domain!==domain)}),new RegExp(`READINESS_EVIDENCE_MISSING:${domain}`));
 }
});

test('RC2 production gate rejects blocked/missing evidence and unresolved P0/P1',()=>{
 const gate=new ProductionReadinessGate();
 assert.throws(()=>gate.authorize({envelope,evidence:evidence.map(e=>e.domain==='BACKUP_RESTORE'?{...e,status:'BLOCKED'}:e)}),/READINESS_EVIDENCE_NOT_PASS:BACKUP_RESTORE:BLOCKED/);
 assert.throws(()=>gate.authorize({envelope,evidence,unresolvedFindings:[{severity:'P1',id:'RC2-P1-007'}]}),/UNRESOLVED_BLOCKING_FINDINGS:RC2-P1-007/);
 assert.doesNotThrow(()=>gate.authorize({envelope,evidence,unresolvedFindings:[{severity:'P2',id:'RC2-P2-001'}]}));
});

test('RC2 production gate forbids sandbox provider and evidence-envelope substitution',()=>{
 const gate=new ProductionReadinessGate();
 assert.throws(()=>gate.authorize({envelope:{...envelope,provider:'SANDBOX_MOMO'},evidence}),/SANDBOX_PROVIDER_FORBIDDEN_IN_PRODUCTION/);
 assert.throws(()=>gate.authorize({envelope:{...envelope,provider:'TELECEL_CASH_GH_PROD'},evidence}),/PAYMENT_EVIDENCE_PROVIDER_MISMATCH/);
 assert.throws(()=>gate.authorize({envelope:{...envelope,policyVersion:'GH-PILOT-TITLE-RISK-v2'},evidence}),/TITLE_RISK_POLICY_EVIDENCE_MISMATCH/);
});

test('RC2 production gate authorizes only a complete exact envelope',()=>{
 const gate=new ProductionReadinessGate();
 const result=gate.authorize({envelope,evidence});
 assert.equal(result.authorized,true);
 assert.equal(result.envelope.provider,'MTN_MOMO_GH_PROD');
 assert.equal(result.evidence.length,9);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.envelope));
 assert.ok(Object.isFrozen(result.evidence));
});
