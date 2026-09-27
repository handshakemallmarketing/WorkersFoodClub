import test from 'node:test';
import assert from 'node:assert/strict';
import { asId } from '../../dist/packages/kernel/src/index.js';
import {
  OWNER_ACTION,
  ADMIN_ACTION,
  tierOf,
  assertGrantIssuable,
  assertGrantRevocable,
} from '../../dist/packages/authority/src/hierarchy.js';

const grant = (overrides = {}) => ({
  id: asId('grant:test'),
  grantorId: asId('participant:grantor'),
  actorId: asId('participant:actor'),
  actions: ['operator:orders.read'],
  validFrom: '2026-01-01T00:00:00Z',
  ...overrides,
});

test('tierOf classifies owner, admin, and plain operator action sets', () => {
  assert.equal(tierOf([OWNER_ACTION]), 'OWNER');
  assert.equal(tierOf([ADMIN_ACTION]), 'ADMIN');
  assert.equal(tierOf(['operator:fulfillment.manage']), 'OPERATOR');
});

test('nobody may grant themselves anything, including an Owner or Admin', () => {
  assert.throws(
    () => assertGrantIssuable({
      grantorId: 'participant:owner-1',
      grantorActiveGrants: [grant({ actorId: 'participant:owner-1', actions: [OWNER_ACTION] })],
      actorId: 'participant:owner-1',
      actions: [ADMIN_ACTION],
    }),
    /SELF_GRANT_FORBIDDEN/,
  );
});

test('Owner grants are never issued through this path', () => {
  assert.throws(
    () => assertGrantIssuable({
      grantorId: 'participant:owner-1',
      grantorActiveGrants: [grant({ actorId: 'participant:owner-1', actions: [OWNER_ACTION] })],
      actorId: 'participant:new-person',
      actions: [OWNER_ACTION],
    }),
    /OWNER_GRANT_REQUIRES_BOOTSTRAP_OR_SUCCESSION/,
  );
});

test('only an active Owner may grant Admin -- an Admin cannot create another Admin', () => {
  assert.throws(
    () => assertGrantIssuable({
      grantorId: 'participant:admin-1',
      grantorActiveGrants: [grant({ actorId: 'participant:admin-1', actions: [ADMIN_ACTION] })],
      actorId: 'participant:new-admin',
      actions: [ADMIN_ACTION],
    }),
    /ONLY_OWNER_MAY_GRANT_ADMIN/,
  );

  assert.doesNotThrow(() => assertGrantIssuable({
    grantorId: 'participant:owner-1',
    grantorActiveGrants: [grant({ actorId: 'participant:owner-1', actions: [OWNER_ACTION] })],
    actorId: 'participant:new-admin',
    actions: [ADMIN_ACTION],
  }));
});

test('an active Owner or Admin may grant ordinary operator-tier actions; a plain operator or nobody may not', () => {
  assert.throws(
    () => assertGrantIssuable({
      grantorId: 'participant:operator-1',
      grantorActiveGrants: [grant({ actorId: 'participant:operator-1', actions: ['operator:fulfillment.manage'] })],
      actorId: 'participant:new-operator',
      actions: ['operator:orders.read'],
    }),
    /OPERATOR_GRANT_REQUIRES_ADMIN_OR_OWNER/,
  );
  assert.throws(
    () => assertGrantIssuable({
      grantorId: 'participant:nobody',
      grantorActiveGrants: [],
      actorId: 'participant:new-operator',
      actions: ['operator:orders.read'],
    }),
    /OPERATOR_GRANT_REQUIRES_ADMIN_OR_OWNER/,
  );

  assert.doesNotThrow(() => assertGrantIssuable({
    grantorId: 'participant:admin-1',
    grantorActiveGrants: [grant({ actorId: 'participant:admin-1', actions: [ADMIN_ACTION] })],
    actorId: 'participant:new-operator',
    actions: ['operator:fulfillment.manage', 'operator:orders.read'],
  }));
});

test('a tier-marker grant (Owner/Admin) must be the sole action on its grant', () => {
  assert.throws(
    () => assertGrantIssuable({
      grantorId: 'participant:owner-1',
      grantorActiveGrants: [grant({ actorId: 'participant:owner-1', actions: [OWNER_ACTION] })],
      actorId: 'participant:new-admin',
      actions: [ADMIN_ACTION, 'operator:orders.read'],
    }),
    /AUTHORITY_TIER_GRANT_MUST_BE_SINGLE_ACTION/,
  );
});

test('only an active Owner may revoke an Owner or Admin grant', () => {
  const adminGrant = grant({ id: 'grant:admin-1', actorId: 'participant:admin-1', actions: [ADMIN_ACTION] });
  assert.throws(
    () => assertGrantRevocable({
      revokerId: 'participant:another-admin',
      revokerActiveGrants: [grant({ actorId: 'participant:another-admin', actions: [ADMIN_ACTION] })],
      target: adminGrant,
      allActiveOwnerGrants: [],
    }),
    /ONLY_OWNER_MAY_REVOKE_ADMIN/,
  );

  assert.doesNotThrow(() => assertGrantRevocable({
    revokerId: 'participant:owner-1',
    revokerActiveGrants: [grant({ actorId: 'participant:owner-1', actions: [OWNER_ACTION] })],
    target: adminGrant,
    allActiveOwnerGrants: [],
  }));
});

test('the last remaining active Owner grant can never be revoked, and an Owner cannot revoke their own Owner grant', () => {
  const soleOwnerGrant = grant({ id: 'grant:owner-1', actorId: 'participant:owner-1', actions: [OWNER_ACTION] });
  assert.throws(
    () => assertGrantRevocable({
      revokerId: 'participant:owner-1',
      revokerActiveGrants: [soleOwnerGrant],
      target: soleOwnerGrant,
      allActiveOwnerGrants: [soleOwnerGrant],
    }),
    /OWNER_SELF_REVOCATION_REQUIRES_SUCCESSION/,
  );

  const secondOwnerGrant = grant({ id: 'grant:owner-2', actorId: 'participant:owner-2', actions: [OWNER_ACTION] });
  assert.throws(
    () => assertGrantRevocable({
      revokerId: 'participant:owner-2',
      revokerActiveGrants: [secondOwnerGrant],
      target: soleOwnerGrant,
      allActiveOwnerGrants: [soleOwnerGrant, secondOwnerGrant].filter((g) => g.id === soleOwnerGrant.id),
    }),
    /LAST_OWNER_PROTECTED/,
  );

  assert.doesNotThrow(() => assertGrantRevocable({
    revokerId: 'participant:owner-2',
    revokerActiveGrants: [secondOwnerGrant],
    target: soleOwnerGrant,
    allActiveOwnerGrants: [soleOwnerGrant, secondOwnerGrant],
  }));
});

test('an active Owner or Admin may revoke ordinary operator-tier grants; a plain operator may not', () => {
  const operatorGrant = grant({ id: 'grant:op-1', actorId: 'participant:op-1', actions: ['operator:fulfillment.manage'] });
  assert.throws(
    () => assertGrantRevocable({
      revokerId: 'participant:another-op',
      revokerActiveGrants: [grant({ actorId: 'participant:another-op', actions: ['operator:orders.read'] })],
      target: operatorGrant,
      allActiveOwnerGrants: [],
    }),
    /OPERATOR_REVOCATION_REQUIRES_ADMIN_OR_OWNER/,
  );

  assert.doesNotThrow(() => assertGrantRevocable({
    revokerId: 'participant:admin-1',
    revokerActiveGrants: [grant({ actorId: 'participant:admin-1', actions: [ADMIN_ACTION] })],
    target: operatorGrant,
    allActiveOwnerGrants: [],
  }));
});
