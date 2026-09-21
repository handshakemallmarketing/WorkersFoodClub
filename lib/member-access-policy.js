// Canonical server-side member admission decision surface.
// Authentication proves identity. Membership standing separately determines authorization.
export const MEMBER_ACCESS={GUEST:'GUEST',MEMBERSHIP_PAYMENT_REQUIRED:'MEMBERSHIP_PAYMENT_REQUIRED',MEMBER_ACTIVE:'MEMBER_ACTIVE',MEMBER_GRACE:'MEMBER_GRACE',MEMBER_RESTRICTED:'MEMBER_RESTRICTED'};
export function resolveMemberAccess({membershipStanding,authenticated}){
 if(!authenticated)return Object.freeze({state:MEMBER_ACCESS.GUEST,memberArea:false});
 switch(membershipStanding){
  case 'INITIAL_FEE_DUE': return Object.freeze({state:MEMBER_ACCESS.MEMBERSHIP_PAYMENT_REQUIRED,memberArea:false});
  case 'ACTIVE': return Object.freeze({state:MEMBER_ACCESS.MEMBER_ACTIVE,memberArea:true});
  case 'GRACE': return Object.freeze({state:MEMBER_ACCESS.MEMBER_GRACE,memberArea:true});
  case 'RESTRICTED': case 'SUSPENDED': case 'ENDED': return Object.freeze({state:MEMBER_ACCESS.MEMBER_RESTRICTED,memberArea:false});
  default: return Object.freeze({state:MEMBER_ACCESS.GUEST,memberArea:false});
 }
}
