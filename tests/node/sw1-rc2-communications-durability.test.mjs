import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionReminderEvents} from '../../dist/packages/communications/src/scheduler.js';
import {CommunicationDispatcher} from '../../dist/packages/communications/src/postgres.js';

test('subscription reminders are deterministic and stop for paid or cancelled subscriptions',()=>{
 const due='2026-09-15T12:00:00Z';
 const candidates=[
  {subscriptionId:'sub:1',memberId:'member:1',dueAt:due,amount:'GHS 20.00',status:'ACTIVE'},
  {subscriptionId:'sub:2',memberId:'member:2',dueAt:due,amount:'GHS 20.00',status:'PAID'}
 ];
 const first=subscriptionReminderEvents(candidates,'2026-09-13T12:00:00Z');
 const again=subscriptionReminderEvents(candidates,'2026-09-13T12:00:00Z');
 assert.equal(first.length,1);assert.equal(first[0].type,'SUBSCRIPTION_DUE');assert.equal(first[0].id,again[0].id);
 const overdue=subscriptionReminderEvents([{...candidates[0],status:'PAST_DUE'}],'2026-09-17T12:00:00Z');
 assert.equal(overdue.length,1);assert.equal(overdue[0].type,'SUBSCRIPTION_OVERDUE');
});

test('dispatcher isolates provider failure from other communications and retries through repository state',async()=>{
 const records=[
  {id:'communication:event:1:1:in_app',eventId:'event:1',memberId:'member:1',subjectId:'order:1',eventType:'PAYMENT_CONFIRMED',class:'TRANSACTIONAL',templateId:'WFC-PAYMENT-CONFIRMED',templateVersion:1,channel:'IN_APP',renderedSubject:'Payment confirmed',renderedBody:'ok',status:'QUEUED',queuedAt:'2026-09-11T20:00:00Z',retryCount:0},
  {id:'communication:event:1:1:email',eventId:'event:1',memberId:'member:1',subjectId:'order:1',eventType:'PAYMENT_CONFIRMED',class:'TRANSACTIONAL',templateId:'WFC-PAYMENT-CONFIRMED',templateVersion:1,channel:'EMAIL',renderedSubject:'Payment confirmed',renderedBody:'ok',status:'QUEUED',queuedAt:'2026-09-11T20:00:00Z',retryCount:0}
 ];
 const sent=[],failed=[];
 const repository={claimDispatchBatch:async()=>records,markSent:async(...x)=>sent.push(x),markFailed:async(...x)=>failed.push(x)};
 const adapter={channel:'EMAIL',send:async()=>{throw new Error('EMAIL_PROVIDER_DOWN')}};
 const dispatcher=new CommunicationDispatcher(repository,[adapter],'worker:1',()=> '2026-09-11T20:01:00Z');
 const result=await dispatcher.run();
 assert.deepEqual(result,{sent:1,failed:1});
 assert.equal(sent[0][0],records[0].id);assert.equal(failed[0][0],records[1].id);assert.equal(failed[0][2],'EMAIL_PROVIDER_DOWN');
});
