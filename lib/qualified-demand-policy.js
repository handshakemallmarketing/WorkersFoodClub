export const DEMAND_POOL_BPS=3000;
export const CURRENT_BATCH_BPS=5000;
export const PRORATED_FULFILLMENT_BPS=7000;
export const FULL_PAYMENT_BPS=10000;
export const FULL_PAYMENT_DEADLINE_HOURS=24;

export function requiredMinor(totalMinor,bps){
 if(!Number.isInteger(totalMinor)||totalMinor<0)throw new TypeError('totalMinor must be a non-negative integer');
 return Math.ceil((totalMinor*bps)/10000);
}

export function qualificationState({totalMinor,paidMinor}){
 const paid=Math.max(0,Number(paidMinor)||0),total=Number(totalMinor);
 if(paid>=requiredMinor(total,FULL_PAYMENT_BPS))return 'FULLY_PAID';
 if(paid>=requiredMinor(total,PRORATED_FULFILLMENT_BPS))return 'PRORATED_FULFILLMENT';
 if(paid>=requiredMinor(total,CURRENT_BATCH_BPS))return 'CURRENT_BATCH_RESCHEDULE';
 if(paid>=requiredMinor(total,DEMAND_POOL_BPS))return 'DEMAND_QUALIFIED';
 return 'UNQUALIFIED';
}

export function paymentDeadline(deliveryAt){
 const t=new Date(deliveryAt).getTime();if(!Number.isFinite(t))throw new TypeError('deliveryAt required');
 return new Date(t-FULL_PAYMENT_DEADLINE_HOURS*60*60*1000);
}

// At/after T-24h every cedi paid has exactly one destination: fulfilled merchandise or shopping credit.
// No cash refund, deduction, penalty, or double compensation is permitted.
export function deadlineDisposition({totalMinor,paidMinor,deliveryAt,now=new Date(),appliedToFulfillmentMinor=0}){
 const deadline=paymentDeadline(deliveryAt),state=qualificationState({totalMinor,paidMinor});
 if(new Date(now)<deadline)return {due:false,state,shoppingCreditMinor:0,cashRefundMinor:0,penaltyMinor:0};
 const paid=Math.max(0,Number(paidMinor)||0),applied=Math.max(0,Math.min(paid,Number(appliedToFulfillmentMinor)||0));
 if(state==='FULLY_PAID')return {due:true,state,shoppingCreditMinor:0,cashRefundMinor:0,penaltyMinor:0,appliedToFulfillmentMinor:paid};
 if(state==='PRORATED_FULFILLMENT')return {due:true,state,shoppingCreditMinor:paid-applied,cashRefundMinor:0,penaltyMinor:0,appliedToFulfillmentMinor:applied};
 if(state==='CURRENT_BATCH_RESCHEDULE')return {due:true,state,shoppingCreditMinor:0,cashRefundMinor:0,penaltyMinor:0,carryForwardMinor:paid};
 return {due:true,state,shoppingCreditMinor:paid,cashRefundMinor:0,penaltyMinor:0,appliedToFulfillmentMinor:0};
}

export const missedDeadlineDisposition=deadlineDisposition;
