export const OPERATOR_FULFILLMENT_ACTOR_ID = 'preview:operator:fulfillment:001';
export const OPERATOR_FINANCE_ACTOR_ID = 'preview:operator:finance:001';
export const OPERATOR_ADMIN_ACTOR_ID = 'preview:operator:001';

export const OPERATOR_TIER_SCOPES = {
  [OPERATOR_FULFILLMENT_ACTOR_ID]: ['operator:fulfillment.manage', 'operator:orders.read'],
  [OPERATOR_FINANCE_ACTOR_ID]: ['operator:refund.authorize', 'operator:refund.complete', 'operator:orders.read'],
  [OPERATOR_ADMIN_ACTOR_ID]: [
    'operator:fulfillment.manage',
    'operator:refund.authorize',
    'operator:refund.complete',
    'operator:orders.read',
  ],
};

export const FULFILLMENT_CAPABLE_OPERATORS = [OPERATOR_FULFILLMENT_ACTOR_ID, OPERATOR_ADMIN_ACTOR_ID];
export const FINANCE_CAPABLE_OPERATORS = [OPERATOR_FINANCE_ACTOR_ID, OPERATOR_ADMIN_ACTOR_ID];
export const ORDERS_READ_CAPABLE_OPERATORS = [
  OPERATOR_FULFILLMENT_ACTOR_ID,
  OPERATOR_FINANCE_ACTOR_ID,
  OPERATOR_ADMIN_ACTOR_ID,
];

/** True when a scope set holds every scope the Admin tier holds (fulfillment + finance combined). */
export function isAdminOperator(scopes) {
  const held = new Set(Array.isArray(scopes) ? scopes : []);
  return OPERATOR_TIER_SCOPES[OPERATOR_ADMIN_ACTOR_ID].every((scope) => held.has(scope));
}
