import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryCommunicationStore,MemberCommunicationsService,communicationClassForEvent,templateForEvent} from '../../dist/packages/communications/src/index.js';

const prefs=(overrides={})=>({memberId:'member:1',transactionalChannels:['IN_APP','EMAIL'],promotionalOptIn:false,promotionalChannels:['EMAIL'],...overrides});
const event=(id,type,occurredAt='2026-09-11T23:00:00Z',data={})=>({id,memberId:'member:1',type,occurredAt,subjectId:'order:1',data});

test('payment and refund communications are transactional and do not depend on marketing opt-in',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  const payment=service.enqueue(event('event:payment','PAYMENT_CONFIRMED',undefined,{amount:'GHS 80.00',order:'#1001',reference:'pay-1'}),prefs());
  assert.equal(payment.length,2);assert.deepEqual(payment.map(x=>x.channel),['IN_APP','EMAIL']);
  assert.ok(payment.every(x=>x.class==='TRANSACTIONAL'&&x.status==='QUEUED'));
  assert.match(payment[0].renderedBody,/GHS 80.00/);assert.match(payment[0].renderedBody,/pay-1/);
  const refund=service.enqueue(event('event:refund','REFUND_PROCESSING',undefined,{amount:'GHS 80.00',order:'#1001',reference:'refund-1'}),prefs());
  assert.equal(refund.length,2);assert.ok(refund.every(x=>x.class==='TRANSACTIONAL'));
});

test('promotional deals and discounts require explicit promotional opt-in',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  const deal=event('event:deal','DEAL_AVAILABLE',undefined,{deal:'10% off onions',expiresAt:'Friday'});
  assert.deepEqual(service.enqueue(deal,prefs()),[]);
  const allowed=service.enqueue(deal,prefs({promotionalOptIn:true,promotionalChannels:['EMAIL','IN_APP']}));
  assert.equal(allowed.length,2);assert.ok(allowed.every(x=>x.class==='PROMOTIONAL'));
});

test('subscription fee reminders remain transactional even when promotional messages are disabled',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  const records=service.enqueue(event('event:subscription','SUBSCRIPTION_DUE',undefined,{amount:'GHS 20.00',dueDate:'15 Sep 2026'}),prefs({promotionalOptIn:false}));
  assert.equal(records.length,2);assert.ok(records.every(x=>x.class==='TRANSACTIONAL'));assert.match(records[0].renderedBody,/15 Sep 2026/);
});

test('canonical event delivery is idempotent per template version and channel',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  const input=event('event:idempotent','PAYMENT_CONFIRMED',undefined,{amount:'GHS 1.00',order:'#1',reference:'p1'});
  const first=service.enqueue(input,prefs());const second=service.enqueue(input,prefs());
  assert.equal(first.length,2);assert.equal(second.length,2);assert.equal(second[0].id,first[0].id);assert.equal(store.listForMember('member:1').length,2);
});

test('channel suppression applies without suppressing unsuppressed transactional channels',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  const records=service.enqueue(event('event:suppress','ORDER_READY',undefined,{order:'#2',fulfillment:'pickup'}),prefs({suppressedChannels:['EMAIL']}));
  assert.deepEqual(records.map(x=>x.channel),['IN_APP']);
});

test('delivery failure is isolated, auditable and retryable without changing the business event',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  const [record]=service.enqueue(event('event:failure','REFUND_COMPLETED',undefined,{amount:'GHS 1.00',order:'#3',reference:'r1'}),prefs({transactionalChannels:['EMAIL']}));
  const failed=service.markFailed(record.id,'SMTP_TEMPORARY','2026-09-11T23:00:02Z');
  assert.equal(failed.status,'FAILED');assert.equal(failed.retryCount,1);assert.equal(failed.eventId,'event:failure');
  const retried=service.retry(record.id);assert.equal(retried.status,'QUEUED');assert.equal(retried.retryCount,1);assert.equal(retried.eventId,'event:failure');
});

test('sent and delivered transitions retain provider evidence and reject invalid transition order',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  const [record]=service.enqueue(event('event:delivery','PAYMENT_CONFIRMED',undefined,{amount:'GHS 5.00',order:'#4',reference:'p4'}),prefs({transactionalChannels:['EMAIL']}));
  assert.throws(()=>service.markDelivered(record.id,'2026-09-11T23:00:02Z'),/COMMUNICATION_DELIVERED_TRANSITION_INVALID/);
  const sent=service.markSent(record.id,'provider-msg-1','2026-09-11T23:00:02Z');assert.equal(sent.status,'SENT');assert.equal(sent.providerMessageId,'provider-msg-1');
  const delivered=service.markDelivered(record.id,'2026-09-11T23:00:03Z');assert.equal(delivered.status,'DELIVERED');
});

test('promotional frequency cap suppresses additional campaigns while transactional notices continue',()=>{
  let now='2026-09-11T10:00:00Z';const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=>now,{promotionalFrequencyCap:2,promotionalWindowMs:7*24*60*60*1000});
  const p=prefs({promotionalOptIn:true,promotionalChannels:['IN_APP'],transactionalChannels:['IN_APP']});
  assert.equal(service.enqueue(event('promo:1','DEAL_AVAILABLE',now,{deal:'Deal 1',expiresAt:'Friday'}),p).length,1);
  now='2026-09-11T11:00:00Z';assert.equal(service.enqueue(event('promo:2','DISCOUNT_AVAILABLE',now,{discount:'5%',item:'rice',callToAction:'View deal'}),p).length,1);
  now='2026-09-11T12:00:00Z';assert.equal(service.enqueue(event('promo:3','DEMAND_COMMITMENT_PROGRESS',now,{percent:'72',item:'onions',callToAction:'Commit now'}),p).length,0);
  assert.equal(service.enqueue(event('txn:1','SUBSCRIPTION_DUE',now,{amount:'GHS 20.00',dueDate:'tomorrow'}),p).length,1);
});

test('member mismatch fails closed and event taxonomy is explicit',()=>{
  const store=new InMemoryCommunicationStore();const service=new MemberCommunicationsService(store,()=> '2026-09-11T23:00:01Z');
  assert.throws(()=>service.enqueue({...event('event:mismatch','PAYMENT_FAILED'),memberId:'member:2'},prefs()),/COMMUNICATION_MEMBER_MISMATCH/);
  assert.equal(communicationClassForEvent('PAYMENT_CONFIRMED'),'TRANSACTIONAL');assert.equal(communicationClassForEvent('DEAL_AVAILABLE'),'PROMOTIONAL');
  assert.equal(templateForEvent('REFUND_COMPLETED').version,1);
});
