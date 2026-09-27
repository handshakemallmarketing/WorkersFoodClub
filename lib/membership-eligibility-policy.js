// Canonical domain eligibility predicates. Consumers must not independently
// interpret membership-standing strings.
export function isMemberAreaEligibleStanding(standing){return standing==='ACTIVE'||standing==='GRACE';}
export function isCommerceEligibleMembership(standing){return standing==='ACTIVE'||standing==='GRACE';}
export function isRestrictedMembershipStanding(standing){return standing==='RESTRICTED'||standing==='SUSPENDED'||standing==='TERMINATED';}
