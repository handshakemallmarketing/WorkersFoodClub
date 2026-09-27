export type OperatorRole = "SYSTEM_OWNER" | "ADMIN" | "BUSINESS_USER" | "WAREHOUSE_MANAGER" | "MARKETING_PROMOTIONS" | "DELIVERY";

export type AuthorityGrant = Readonly<{
  grantId: string;
  participantId: string;
  role: OperatorRole;
  permissions: readonly string[];
  grantedAt: string;
  grantedBy: string;
  revokedAt?: string;
}>;

export type AuthorityDecision = Readonly<{
  allowed: boolean;
  reason: "AUTHORIZED" | "NO_ACTIVE_GRANT" | "PERMISSION_DENIED";
  grantId?: string;
}>;

/**
 * System Owner is the sole constitutional principal. Admin is appointed/revoked
 * by System Owner and may administer bounded operator permissions, but cannot
 * create or promote another System Owner. Ordinary operators receive only the
 * domains/functions required for their work.
 */
export const ROLE_PERMISSION_CEILINGS: Readonly<Record<OperatorRole, readonly string[]>> = {
  SYSTEM_OWNER: ["feature:manage", "admin:manage", "operator:manage", "business:read", "warehouse:manage", "marketing:manage", "delivery:manage"],
  ADMIN: ["operator:manage", "business:read", "warehouse:manage", "marketing:manage", "delivery:manage"],
  BUSINESS_USER: ["business:read"],
  WAREHOUSE_MANAGER: ["business:read", "warehouse:manage"],
  MARKETING_PROMOTIONS: ["business:read", "marketing:manage"],
  DELIVERY: ["business:read", "delivery:manage"],
};

export function validateGrant(grant: AuthorityGrant): void {
  const ceiling = new Set(ROLE_PERMISSION_CEILINGS[grant.role]);
  if (grant.permissions.length === 0) throw new Error("EMPTY_AUTHORITY_GRANT");
  for (const permission of grant.permissions) {
    if (!ceiling.has(permission)) throw new Error("ROLE_PERMISSION_CEILING_EXCEEDED");
  }
}

export function authorizeOperatorAction(input: Readonly<{
  participantId: string;
  permission: string;
  grants: readonly AuthorityGrant[];
  now: string;
}>): AuthorityDecision {
  const active = input.grants.filter(grant => {
    if (grant.participantId !== input.participantId) return false;
    if (Date.parse(grant.grantedAt) > Date.parse(input.now)) return false;
    if (grant.revokedAt !== undefined && Date.parse(grant.revokedAt) <= Date.parse(input.now)) return false;
    return true;
  });
  if (active.length === 0) return { allowed: false, reason: "NO_ACTIVE_GRANT" };
  const grant = active.find(candidate => candidate.permissions.includes(input.permission));
  return grant ? { allowed: true, reason: "AUTHORIZED", grantId: grant.grantId } : { allowed: false, reason: "PERMISSION_DENIED" };
}

/** System Owner continuity is mandatory; Admin never counts as an Owner substitute. */
export function assertOwnerContinuity(input: Readonly<{
  grants: readonly AuthorityGrant[];
  revokingGrantId: string;
  now: string;
}>): void {
  const remaining = input.grants.filter(grant =>
    grant.grantId !== input.revokingGrantId &&
    grant.role === "SYSTEM_OWNER" &&
    (grant.revokedAt === undefined || Date.parse(grant.revokedAt) > Date.parse(input.now)),
  );
  if (remaining.length === 0) throw new Error("LAST_OWNER_PROTECTION");
}

export type FeatureState = "ENABLED" | "SUSPENDED";
export type FeatureControl = Readonly<{ featureId: string; state: FeatureState; changedAt: string; changedBy: string; authorityGrantId: string; reason: string }>;

export function changeFeatureState(input: Readonly<{ featureId: string; state: FeatureState; reason: string; actorId: string; grants: readonly AuthorityGrant[]; now: string }>): FeatureControl {
  const authority = authorizeOperatorAction({ participantId: input.actorId, permission: "feature:manage", grants: input.grants, now: input.now });
  if (!authority.allowed || !authority.grantId) throw new Error("FEATURE_CONTROL_UNAUTHORIZED");
  if (!input.reason.trim()) throw new Error("FEATURE_CONTROL_REASON_REQUIRED");
  return { featureId: input.featureId, state: input.state, changedAt: input.now, changedBy: input.actorId, authorityGrantId: authority.grantId, reason: input.reason };
}
