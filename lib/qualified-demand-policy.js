export const QUALIFICATION_BPS=3000;
export const FULL_PAYMENT_BPS=10000;
export const FULL_PAYMENT_DEADLINE_HOURS=24;

export function requiredMinor(totalMinor,bps){
 if(!Number.isInteger(totalMinor)||totalMinor<0)throw new TypeError('totalMinor must be a non-negative integer');
 return Math.ceil((totalMinor*bps)/10000);
}
export function qualificationState({totalMinor,paidMinor}){
 const paid=Math.max(0,Number(paidMinor)||0),total=Number(totalMinor);
 if(paid>=requiredMinor(total,FULL_PAYMENT_BPS))return 'FULLY_PAID';
 if(paid>=requiredMinor(total,QUALIFICATION_BPS))return 'QUALIFIED';
 return 'UNQUALIFIED';
}
export function paymentDeadline(deliveryAt){
 const t=new Date(deliveryAt).getTime();if(!Number.isFinite(t))throw new TypeError('deliveryAt required');
 return new Date(t-FULL_PAYMENT_DEADLINE_HOURS*60*60*1000);
}
export function missedDeadlineDisposition({totalMinor,paidMinor,deliveryAt,now=new Date()}){
 const deadline=paymentDeadline(deliveryAt);const state=qualificationState({totalMinor,paidMinor});
 if(new Date(now)<deadline||state==='FULLY_PAID')return {due:false,state,shoppingCreditMinor:0};
 return {due:true,state:'DEADLINE_MISSED',shoppingCreditMinor:Math.max(0,Number(paidMinor)||0),cashRefundMinor:0,penaltyMinor:0};
}
