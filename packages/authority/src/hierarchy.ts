import type {AuthorityGrant} from './index.js';

/**
 * Meta-authority markers. Held on their own (never mixed into an operator-action
 * grant) so that revoking "is this person an Admin" never accidentally strips
 * unrelated operational permissions from the same row, and vice versa.
 */
export const OWNER_ACTION = 'authority:owner';
export const ADMIN_ACTION = 'authority:admin';

export type HierarchyTier = 'OWNER' | 'ADMIN' | 'OPERATOR';

export function tierOf(actions: readonly string[]): HierarchyTier {
  if (actions.includes(OWNER_ACTION)) return 'OWNER';
  if (actions.includes(ADMIN_ACTION)) return 'ADMIN';
  return 'OPERATOR';
}

function activeTiers(grants: readonly AuthorityGrant[]): Set<HierarchyTier> {
  return new Set(grants.map((g) => tierOf(g.actions)));
}

export interface IssueGrantRequest {
  readonly grantorId: string;
  /** The grantor's own currently-active grants, already filtered by the caller for validity at the intended time. */
  readonly grantorActiveGrants: readonly AuthorityGrant[];
  readonly actorId: string;
  readonly actions: readonly string[];
}

/**
 * Throws unless the grantor is authorized to issue this exact grant. Never
 * mutates or persists anything -- pure policy, so the live DB-backed grant
 * issuance path and its tests share one source of truth for the rule.
 *
 * Rules (see docs/AUTHORITY_HIERARCHY, this is the executable version of it):
 *  - Nobody grants themselves anything, ever -- including Owner and Admin.
 *  - Only an active Owner may grant Admin.
 *  - Owner grants are never issued through this path at all (bootstrap or a
 *    separate, explicitly-accepted succession flow only).
 *  - An active Owner or Admin may grant ordinary operator-tier actions.
 *  - A grant is either a pure tier marker (exactly one action: Owner or Admin)
 *    or a bundle of ordinary operator actions -- never both in the same grant.
 */
export function assertGrantIssuable(request: IssueGrantRequest): void {
  const {grantorId, grantorActiveGrants, actorId, actions} = request;
  if (actions.length === 0) throw new Error('GRANT_ACTIONS_REQUIRED');
  if (actorId === grantorId) throw new Error('SELF_GRANT_FORBIDDEN');

  const requestedTier = tierOf(actions);
  if (requestedTier !== 'OPERATOR' && actions.length > 1) {
    throw new Error('AUTHORITY_TIER_GRANT_MUST_BE_SINGLE_ACTION');
  }
  if (requestedTier === 'OWNER') {
    throw new Error('OWNER_GRANT_REQUIRES_BOOTSTRAP_OR_SUCCESSION');
  }

  const grantorTiers = activeTiers(grantorActiveGrants);
  if (requestedTier === 'ADMIN') {
    if (!grantorTiers.has('OWNER')) throw new Error('ONLY_OWNER_MAY_GRANT_ADMIN');
    return;
  }
  if (!grantorTiers.has('OWNER') && !grantorTiers.has('ADMIN')) {
    throw new Error('OPERATOR_GRANT_REQUIRES_ADMIN_OR_OWNER');
  }
}

export interface RevokeGrantRequest {
  readonly revokerId: string;
  readonly revokerActiveGrants: readonly AuthorityGrant[];
  readonly target: AuthorityGrant;
  /** Every currently-active Owner grant system-wide, for last-owner protection. */
  readonly allActiveOwnerGrants: readonly AuthorityGrant[];
}

/**
 * Throws unless the revoker is authorized to revoke this exact grant.
 *
 *  - Only an active Owner may revoke an Owner or Admin grant.
 *  - An Owner may not revoke their own Owner grant directly (that is a
 *    succession action, not a revocation -- prevents an accidental or
 *    coerced self-removal that leaves nobody in control mid-request).
 *  - The last remaining active Owner grant can never be revoked.
 *  - An active Owner or Admin may revoke ordinary operator-tier grants.
 */
export function assertGrantRevocable(request: RevokeGrantRequest): void {
  const {revokerId, revokerActiveGrants, target, allActiveOwnerGrants} = request;
  const targetTier = tierOf(target.actions);
  const revokerTiers = activeTiers(revokerActiveGrants);

  if (targetTier === 'OWNER') {
    if (!revokerTiers.has('OWNER')) throw new Error('ONLY_OWNER_MAY_REVOKE_OWNER');
    if (revokerId === target.actorId) throw new Error('OWNER_SELF_REVOCATION_REQUIRES_SUCCESSION');
    const remaining = allActiveOwnerGrants.filter((g) => g.id !== target.id);
    if (remaining.length === 0) throw new Error('LAST_OWNER_PROTECTED');
    return;
  }
  if (targetTier === 'ADMIN') {
    if (!revokerTiers.has('OWNER')) throw new Error('ONLY_OWNER_MAY_REVOKE_ADMIN');
    return;
  }
  if (!revokerTiers.has('OWNER') && !revokerTiers.has('ADMIN')) {
    throw new Error('OPERATOR_REVOCATION_REQUIRES_ADMIN_OR_OWNER');
  }
}
