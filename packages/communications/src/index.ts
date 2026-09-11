export type CommunicationClass='TRANSACTIONAL'|'PROMOTIONAL';
export type CommunicationChannel='IN_APP'|'EMAIL'|'SMS'|'WHATSAPP';
export type CommunicationStatus='QUEUED'|'SENT'|'DELIVERED'|'FAILED'|'SUPPRESSED';

export type CommunicationEventType=
  |'PAYMENT_CONFIRMED'|'PAYMENT_FAILED'
  |'REFUND_AUTHORIZED'|'REFUND_PROCESSING'|'REFUND_COMPLETED'|'REFUND_FAILED'
  |'ORDER_READY'|'PICKUP_REMINDER'|'FULFILLMENT_EXCEPTION'
  |'SUBSCRIPTION_DUE'|'SUBSCRIPTION_OVERDUE'
  |'DEAL_AVAILABLE'|'DISCOUNT_AVAILABLE'|'DEMAND_COMMITMENT_PROGRESS';

export interface CanonicalCommunicationEvent {
  readonly id:string;
  readonly memberId:string;
  readonly type:CommunicationEventType;
  readonly occurredAt:string;
  readonly subjectId:string;
  readonly data:Readonly<Record<string,string>>;
}

export interface MemberCommunicationPreferences {
  readonly memberId:string;
  readonly transactionalChannels:readonly CommunicationChannel[];
  readonly promotionalOptIn:boolean;
  readonly promotionalChannels:readonly CommunicationChannel[];
  readonly suppressedChannels?:readonly CommunicationChannel[];
}

export interface CommunicationTemplate {
  readonly id:string;
  readonly version:number;
  readonly eventType:CommunicationEventType;
  readonly class:CommunicationClass;
  readonly subject:string;
  readonly body:string;
}

export interface CommunicationRecord {
  readonly id:string;
  readonly eventId:string;
  readonly memberId:string;
  readonly subjectId:string;
  readonly eventType:CommunicationEventType;
  readonly class:CommunicationClass;
  readonly templateId:string;
  readonly templateVersion:number;
  readonly channel:CommunicationChannel;
  readonly renderedSubject:string;
  readonly renderedBody:string;
  readonly status:CommunicationStatus;
  readonly queuedAt:string;
  readonly sentAt?:string;
  readonly deliveredAt?:string;
  readonly failedAt?:string;
  readonly providerMessageId?:string;
  readonly retryCount:number;
  readonly failureReason?:string;
}

export interface CommunicationStore {
  getByDedupeKey(key:string):CommunicationRecord|undefined;
  save(key:string,record:CommunicationRecord):void;
  get(id:string):CommunicationRecord|undefined;
  listForMember(memberId:string):readonly CommunicationRecord[];
}

const transactionalTypes=new Set<CommunicationEventType>([
  'PAYMENT_CONFIRMED','PAYMENT_FAILED','REFUND_AUTHORIZED','REFUND_PROCESSING','REFUND_COMPLETED','REFUND_FAILED',
  'ORDER_READY','PICKUP_REMINDER','FULFILLMENT_EXCEPTION','SUBSCRIPTION_DUE','SUBSCRIPTION_OVERDUE'
]);

const promotionalTypes=new Set<CommunicationEventType>(['DEAL_AVAILABLE','DISCOUNT_AVAILABLE','DEMAND_COMMITMENT_PROGRESS']);

function validTime(value:string):boolean{return Number.isFinite(Date.parse(value));}
function nonblank(value:string):boolean{return value.trim().length>0;}
function uniq<T>(values:readonly T[]):readonly T[]{return [...new Set(values)];}
function klass(type:CommunicationEventType):CommunicationClass{
  if(transactionalTypes.has(type)) return 'TRANSACTIONAL';
  if(promotionalTypes.has(type)) return 'PROMOTIONAL';
  throw new Error('COMMUNICATION_EVENT_CLASS_UNKNOWN');
}
function templateKey(type:CommunicationEventType):string{return `WFC-${type}`;}
function interpolate(value:string,data:Readonly<Record<string,string>>):string{
  return value.replace(/\{\{([A-Za-z0-9_]+)\}\}/g,(_,key:string)=>data[key]??'');
}
function freeze<T>(value:T):Readonly<T>{return Object.freeze(value);}

const templates:Readonly<Record<CommunicationEventType,CommunicationTemplate>>=Object.freeze({
  PAYMENT_CONFIRMED:{id:'WFC-PAYMENT-CONFIRMED',version:1,eventType:'PAYMENT_CONFIRMED',class:'TRANSACTIONAL',subject:'Payment confirmed',body:'Your payment of {{amount}} for {{order}} is confirmed. Reference: {{reference}}.'},
  PAYMENT_FAILED:{id:'WFC-PAYMENT-FAILED',version:1,eventType:'PAYMENT_FAILED',class:'TRANSACTIONAL',subject:'Payment not completed',body:'Your payment for {{order}} was not completed. No confirmed payment has been recorded.'},
  REFUND_AUTHORIZED:{id:'WFC-REFUND-AUTHORIZED',version:1,eventType:'REFUND_AUTHORIZED',class:'TRANSACTIONAL',subject:'Refund approved',body:'Your refund of {{amount}} for {{order}} has been approved and will be submitted for processing.'},
  REFUND_PROCESSING:{id:'WFC-REFUND-PROCESSING',version:1,eventType:'REFUND_PROCESSING',class:'TRANSACTIONAL',subject:'Refund processing',body:'Your refund of {{amount}} for {{order}} is being processed. Reference: {{reference}}.'},
  REFUND_COMPLETED:{id:'WFC-REFUND-COMPLETED',version:1,eventType:'REFUND_COMPLETED',class:'TRANSACTIONAL',subject:'Refund completed',body:'Your refund of {{amount}} for {{order}} is complete. Reference: {{reference}}.'},
  REFUND_FAILED:{id:'WFC-REFUND-FAILED',version:1,eventType:'REFUND_FAILED',class:'TRANSACTIONAL',subject:'Refund needs attention',body:'Your refund for {{order}} needs attention. We are resolving it; you do not need to pay again.'},
  ORDER_READY:{id:'WFC-ORDER-READY',version:1,eventType:'ORDER_READY',class:'TRANSACTIONAL',subject:'Order ready',body:'Your order {{order}} is ready for {{fulfillment}}.'},
  PICKUP_REMINDER:{id:'WFC-PICKUP-REMINDER',version:1,eventType:'PICKUP_REMINDER',class:'TRANSACTIONAL',subject:'Pickup reminder',body:'Reminder: order {{order}} is ready for pickup {{pickupWindow}}.'},
  FULFILLMENT_EXCEPTION:{id:'WFC-FULFILLMENT-EXCEPTION',version:1,eventType:'FULFILLMENT_EXCEPTION',class:'TRANSACTIONAL',subject:'Order update',body:'There is an issue affecting {{order}}. Status: {{status}}. We will keep you updated.'},
  SUBSCRIPTION_DUE:{id:'WFC-SUBSCRIPTION-DUE',version:1,eventType:'SUBSCRIPTION_DUE',class:'TRANSACTIONAL',subject:'Membership fee reminder',body:'Your membership fee of {{amount}} is due {{dueDate}}.'},
  SUBSCRIPTION_OVERDUE:{id:'WFC-SUBSCRIPTION-OVERDUE',version:1,eventType:'SUBSCRIPTION_OVERDUE',class:'TRANSACTIONAL',subject:'Membership fee overdue',body:'Your membership fee of {{amount}} was due {{dueDate}}. Please review your membership account.'},
  DEAL_AVAILABLE:{id:'WFC-DEAL-AVAILABLE',version:1,eventType:'DEAL_AVAILABLE',class:'PROMOTIONAL',subject:'New member deal',body:'New member deal: {{deal}}. Available until {{expiresAt}}.'},
  DISCOUNT_AVAILABLE:{id:'WFC-DISCOUNT-AVAILABLE',version:1,eventType:'DISCOUNT_AVAILABLE',class:'PROMOTIONAL',subject:'Member discount available',body:'Member discount: {{discount}} on {{item}}. {{callToAction}}'},
  DEMAND_COMMITMENT_PROGRESS:{id:'WFC-DEMAND-COMMITMENT-PROGRESS',version:1,eventType:'DEMAND_COMMITMENT_PROGRESS',class:'PROMOTIONAL',subject:'Group-buy progress',body:'Members have committed {{percent}}% of the quantity needed for {{item}}. {{callToAction}}'}
});

export class InMemoryCommunicationStore implements CommunicationStore {
  private readonly records=new Map<string,CommunicationRecord>();
  private readonly dedupe=new Map<string,string>();
  getByDedupeKey(key:string):CommunicationRecord|undefined{const id=this.dedupe.get(key);return id?this.records.get(id):undefined;}
  save(key:string,record:CommunicationRecord):void{this.records.set(record.id,record);this.dedupe.set(key,record.id);}
  get(id:string):CommunicationRecord|undefined{return this.records.get(id);}
  listForMember(memberId:string):readonly CommunicationRecord[]{return [...this.records.values()].filter(x=>x.memberId===memberId).sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt));}
}

export interface CommunicationPolicy {
  readonly promotionalFrequencyCap:number;
  readonly promotionalWindowMs:number;
}

export class MemberCommunicationsService {
  constructor(
    private readonly store:CommunicationStore,
    private readonly now:()=>string=()=>new Date().toISOString(),
    private readonly policy:CommunicationPolicy={promotionalFrequencyCap:3,promotionalWindowMs:7*24*60*60*1000}
  ){}

  enqueue(event:CanonicalCommunicationEvent,preferences:MemberCommunicationPreferences):readonly CommunicationRecord[]{
    this.validateEvent(event,preferences);
    const template=templates[event.type];
    if(template.class!==klass(event.type)) throw new Error('COMMUNICATION_TEMPLATE_CLASS_MISMATCH');
    const channels=this.channels(template.class,preferences);
    if(template.class==='PROMOTIONAL'&&!preferences.promotionalOptIn) return [];
    if(template.class==='PROMOTIONAL'&&this.promotionalCapReached(event.memberId,event.occurredAt)) return [];
    const queuedAt=this.now();if(!validTime(queuedAt)) throw new Error('COMMUNICATION_NOW_INVALID');
    const out:CommunicationRecord[]=[];
    for(const channel of channels){
      const key=`${event.id}|${template.id}|${template.version}|${channel}`;
      const existing=this.store.getByDedupeKey(key);if(existing){out.push(existing);continue;}
      const id=`communication:${event.id}:${template.version}:${channel.toLowerCase()}`;
      const record:CommunicationRecord=freeze({id,eventId:event.id,memberId:event.memberId,subjectId:event.subjectId,eventType:event.type,class:template.class,templateId:template.id,templateVersion:template.version,channel,renderedSubject:interpolate(template.subject,event.data),renderedBody:interpolate(template.body,event.data),status:'QUEUED',queuedAt,retryCount:0});
      this.store.save(key,record);out.push(record);
    }
    return Object.freeze(out);
  }

  markSent(id:string,providerMessageId:string,sentAt:string=this.now()):CommunicationRecord{
    if(!nonblank(providerMessageId)||!validTime(sentAt)) throw new Error('COMMUNICATION_SENT_EVIDENCE_INVALID');
    return this.transition(id,'SENT',{sentAt,providerMessageId});
  }
  markDelivered(id:string,deliveredAt:string=this.now()):CommunicationRecord{
    if(!validTime(deliveredAt)) throw new Error('COMMUNICATION_DELIVERY_TIME_INVALID');
    return this.transition(id,'DELIVERED',{deliveredAt});
  }
  markFailed(id:string,reason:string,failedAt:string=this.now()):CommunicationRecord{
    if(!nonblank(reason)||!validTime(failedAt)) throw new Error('COMMUNICATION_FAILURE_EVIDENCE_INVALID');
    const current=this.require(id);const key=this.dedupeKey(current);
    const failed:CommunicationRecord=freeze({...current,status:'FAILED',failedAt,failureReason:reason,retryCount:current.retryCount+1});
    this.store.save(key,failed);return failed;
  }
  retry(id:string):CommunicationRecord{
    const current=this.require(id);if(current.status!=='FAILED') throw new Error('COMMUNICATION_RETRY_NOT_FAILED');
    const key=this.dedupeKey(current);const queued:CommunicationRecord=freeze({...current,status:'QUEUED'});this.store.save(key,queued);return queued;
  }

  private transition(id:string,status:'SENT'|'DELIVERED',extra:Partial<CommunicationRecord>):CommunicationRecord{
    const current=this.require(id);
    if(status==='SENT'&&current.status!=='QUEUED') throw new Error('COMMUNICATION_SENT_TRANSITION_INVALID');
    if(status==='DELIVERED'&&current.status!=='SENT') throw new Error('COMMUNICATION_DELIVERED_TRANSITION_INVALID');
    const next:CommunicationRecord=freeze({...current,...extra,status});this.store.save(this.dedupeKey(current),next);return next;
  }
  private require(id:string):CommunicationRecord{const record=this.store.get(id);if(!record) throw new Error('COMMUNICATION_RECORD_NOT_FOUND');return record;}
  private dedupeKey(record:CommunicationRecord):string{return `${record.eventId}|${record.templateId}|${record.templateVersion}|${record.channel}`;}
  private channels(kind:CommunicationClass,p:MemberCommunicationPreferences):readonly CommunicationChannel[]{
    const selected=kind==='TRANSACTIONAL'?p.transactionalChannels:p.promotionalChannels;
    const suppressed=new Set(p.suppressedChannels??[]);
    return uniq(selected).filter(channel=>!suppressed.has(channel));
  }
  private promotionalCapReached(memberId:string,occurredAt:string):boolean{
    const at=Date.parse(occurredAt);const floor=at-this.policy.promotionalWindowMs;
    const count=this.store.listForMember(memberId).filter(r=>r.class==='PROMOTIONAL'&&Date.parse(r.queuedAt)>=floor&&Date.parse(r.queuedAt)<=at&&r.status!=='SUPPRESSED').length;
    return count>=this.policy.promotionalFrequencyCap;
  }
  private validateEvent(event:CanonicalCommunicationEvent,p:MemberCommunicationPreferences):void{
    if(!nonblank(event.id)||!nonblank(event.memberId)||!nonblank(event.subjectId)||!validTime(event.occurredAt)) throw new Error('COMMUNICATION_EVENT_INVALID');
    if(event.memberId!==p.memberId) throw new Error('COMMUNICATION_MEMBER_MISMATCH');
    klass(event.type);
  }
}

export function communicationClassForEvent(type:CommunicationEventType):CommunicationClass{return klass(type);}
export function templateForEvent(type:CommunicationEventType):CommunicationTemplate{return templates[type];}
