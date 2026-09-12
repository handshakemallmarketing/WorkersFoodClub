import type {CanonicalCommunicationEvent} from './index.js';

export interface SubscriptionReminderCandidate {
  readonly subscriptionId:string;
  readonly memberId:string;
  readonly dueAt:string;
  readonly amount:string;
  readonly status:'ACTIVE'|'PAST_DUE'|'PAID'|'CANCELLED';
}

export interface SubscriptionReminderPolicy {
  readonly beforeDueMs:number;
  readonly overdueAfterMs:number;
}

const defaultPolicy:SubscriptionReminderPolicy={beforeDueMs:3*24*60*60*1000,overdueAfterMs:24*60*60*1000};

export function subscriptionReminderEvents(candidates:readonly SubscriptionReminderCandidate[],now:string,policy:SubscriptionReminderPolicy=defaultPolicy):readonly CanonicalCommunicationEvent[]{
  const nowMs=Date.parse(now);if(!Number.isFinite(nowMs))throw new Error('SUBSCRIPTION_REMINDER_NOW_INVALID');
  const out:CanonicalCommunicationEvent[]=[];
  for(const candidate of candidates){
    const dueMs=Date.parse(candidate.dueAt);if(!candidate.subscriptionId.trim()||!candidate.memberId.trim()||!candidate.amount.trim()||!Number.isFinite(dueMs))throw new Error('SUBSCRIPTION_REMINDER_CANDIDATE_INVALID');
    if(candidate.status==='PAID'||candidate.status==='CANCELLED')continue;
    const dueDate=new Date(dueMs).toISOString();
    if(nowMs>=dueMs+policy.overdueAfterMs){out.push(Object.freeze({id:`subscription-reminder:${candidate.subscriptionId}:overdue:${dueDate.slice(0,10)}`,memberId:candidate.memberId,type:'SUBSCRIPTION_OVERDUE',occurredAt:now,subjectId:candidate.subscriptionId,data:Object.freeze({amount:candidate.amount,dueDate})}));continue;}
    if(nowMs>=dueMs-policy.beforeDueMs&&nowMs<dueMs){out.push(Object.freeze({id:`subscription-reminder:${candidate.subscriptionId}:due:${dueDate.slice(0,10)}`,memberId:candidate.memberId,type:'SUBSCRIPTION_DUE',occurredAt:now,subjectId:candidate.subscriptionId,data:Object.freeze({amount:candidate.amount,dueDate})}));}
  }
  return Object.freeze(out);
}
