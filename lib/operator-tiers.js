export const OPERATOR_FULFILLMENT_ACTOR_ID = 'preview:operator:fulfillment:001';
export const OPERATOR_FINANCE_ACTOR_ID = 'preview:operator:finance:001';
export const OPERATOR_ADMIN_ACTOR_ID = 'preview:operator:001';

/** Held only by the Admin tier. Never inferred -- see isAdminOperator(). */
export const OPERATOR_RELEASE_SCOPE = 'operator:release.manage';

export const OPERATOR_TIER_SCOPES = {
  [OPERATOR_FULFILLMENT_ACTOR_ID]: ['operator:fulfillment.manage', 'operator:orders.read'],
  [OPERATOR_FINANCE_ACTOR_ID]: ['operator:refund.authorize', 'operator:refund.complete', 'operator:orders.read'],
  [OPERATOR_ADMIN_ACTOR_ID]: [
    'operator:fulfillment.manage',
    'operator:refund.authorize',
    'operator:refund.complete',
    'operator:orders.read',
    'operator:support.manage',
    OPERATOR_RELEASE_SCOPE,
  ],
};

export const FULFILLMENT_CAPABLE_OPERATORS = [OPERATOR_FULFILLMENT_ACTOR_ID, OPERATOR_ADMIN_ACTOR_ID];
export const FINANCE_CAPABLE_OPERATORS = [OPERATOR_FINANCE_ACTOR_ID, OPERATOR_ADMIN_ACTOR_ID];
export const ORDERS_READ_CAPABLE_OPERATORS = [
  OPERATOR_FULFILLMENT_ACTOR_ID,
  OPERATOR_FINANCE_ACTOR_ID,
  OPERATOR_ADMIN_ACTOR_ID,
];

/**
 * True only when a scope set holds the explicit release-authority scope.
 *
 * Deliberately NOT inferred from holding every fulfillment + finance scope --
 * a real operator legitimately granted both is not thereby an administrator.
 * Administration is its own grant.
 */
export function isAdminOperator(scopes) {
  return Array.isArray(scopes) && scopes.includes(OPERATOR_RELEASE_SCOPE);
}
