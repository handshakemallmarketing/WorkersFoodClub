import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeOperatorAction, assertOwnerContinuity, changeFeatureState, validateGrant } from '../../dist/packages/governance/src/operator-authority.js';

const now = '2026-09-16T12:00:00Z';
const owner = { grantId: 'grant:owner', participantId: 'owner:1', role: 'SYSTEM_OWNER', permissions: ['feature:manage','operator:manage'], grantedAt: '2026-09-01T00:00:00Z', grantedBy: 'system' };
const backup = { grantId: 'grant:backup', participantId: 'owner:2', role: 'BACKUP_SYSTEM_OWNER', permissions: ['feature:manage','operator:manage'], grantedAt: '2026-09-01T00:00:00Z', grantedBy: 'owner:1' };
const warehouse = { grantId: 'grant:warehouse', participantId: 'operator:warehouse', role: 'WAREHOUSE_MANAGER', permissions: ['business:read','warehouse:manage'], grantedAt: '2026-09-01T00:00:00Z', grantedBy: 'owner:1' };

test('limited operator cannot exceed role ceiling', () => {
  assert.throws(() => validateGrant({ ...warehouse, permissions: ['warehouse:manage','feature:manage'] }), /ROLE_PERMISSION_CEILING_EXCEEDED/);
});

test('authorization is checked at execution time', () => {
  assert.equal(authorizeOperatorAction({ participantId: warehouse.participantId, permission: 'warehouse:manage', grants: [warehouse], now }).allowed, true);
  assert.equal(authorizeOperatorAction({ participantId: warehouse.participantId, permission: 'feature:manage', grants: [warehouse], now }).allowed, false);
});

test('revocation immediately removes authority', () => {
  const revoked = { ...warehouse, revokedAt: '2026-09-16T11:59:00Z' };
  assert.deepEqual(authorizeOperatorAction({ participantId: warehouse.participantId, permission: 'warehouse:manage', grants: [revoked], now }), { allowed: false, reason: 'NO_ACTIVE_GRANT' });
});

test('last owner cannot be removed', () => {
  assert.throws(() => assertOwnerContinuity({ grants: [owner], revokingGrantId: owner.grantId, now }), /LAST_OWNER_PROTECTION/);
  assert.doesNotThrow(() => assertOwnerContinuity({ grants: [owner, backup], revokingGrantId: owner.grantId, now }));
});

test('feature state changes require owner-class feature authority and retain audit lineage', () => {
  assert.throws(() => changeFeatureState({ featureId: 'catalog', state: 'SUSPENDED', reason: 'maintenance', actorId: warehouse.participantId, grants: [warehouse], now }), /FEATURE_CONTROL_UNAUTHORIZED/);
  const event = changeFeatureState({ featureId: 'catalog', state: 'SUSPENDED', reason: 'maintenance', actorId: owner.participantId, grants: [owner], now });
  assert.equal(event.authorityGrantId, owner.grantId);
  assert.equal(event.changedBy, owner.participantId);
});
