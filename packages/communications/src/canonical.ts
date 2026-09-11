import type {CanonicalCommunicationEvent,CommunicationEventType} from './index.js';

export interface CanonicalDomainEventForCommunication {
  readonly eventId:string;
  readonly aggregateId:string;
  readonly eventType:string;
  readonly occurredAt:string;
  readonly payload:Readonly<Record<string,unknown>>;
}

export interface CommunicationProjectionContext {
  readonly memberId:string;
  readonly orderLabel:string;
}

const validTime=(value:string)=>Number.isFinite(Date.parse(value));
const nonblank=(value:string)=>value.trim().length>0;
const object=(value:unknown):Readonly<Record<string,unknown>>|undefined=>typeof value==='object'&&value!==null&&!Array.isArray(value)?value as Readonly<Record<string,unknown>>:undefined;
const text=(value:unknown):string|undefined=>typeof value==='string'&&value.trim()?value:undefined;
const number=(value:unknown):number|undefined=>typeof value==='number'&&Number.isFinite(value)?value:undefined;

function money(value:unknown):string|undefined{
  const x=object(value);if(!x)return undefined;const minor=number(x.minor),currency=text(x.currency);if(minor===undefined||!currency)return undefined;
  return `${currency.toUpperCase()} ${(minor/100).toFixed(2)}`;
}

function build(input:CanonicalDomainEventForCommunication,ctx:CommunicationProjectionContext,type:CommunicationEventType,data:Record<string,string>):CanonicalCommunicationEvent{
  if(!nonblank(input.eventId)||!nonblank(input.aggregateId)||!validTime(input.occurredAt)||!nonblank(ctx.memberId)||!nonblank(ctx.orderLabel))throw new Error('COMMUNICATION_CANONICAL_EVENT_INVALID');
  return Object.freeze({id:input.eventId,memberId:ctx.memberId,type,occurredAt:input.occurredAt,subjectId:input.aggregateId,data:Object.freeze(data)});
}

/**
 * Converts accepted canonical business events into communication events.
 * Provider callbacks and arbitrary request payloads are intentionally not accepted here.
 */
export function communicationEventFromCanonical(input:CanonicalDomainEventForCommunication,ctx:CommunicationProjectionContext):CanonicalCommunicationEvent|undefined{
  const payload=input.payload;
  switch(input.eventType){
    case 'PAYMENT_CONFIRMED': {
      const amount=money(payload.amount);const reference=text(payload.providerReference);
      if(!amount||!reference)throw new Error('COMMUNICATION_PAYMENT_EVIDENCE_INCOMPLETE');
      return build(input,ctx,'PAYMENT_CONFIRMED',{amount,order:ctx.orderLabel,reference});
    }
    case 'PAYMENT_FAILED':
      return build(input,ctx,'PAYMENT_FAILED',{order:ctx.orderLabel});
    case 'FULFILLMENT_READY':
      return build(input,ctx,'ORDER_READY',{order:ctx.orderLabel,fulfillment:text(payload.fulfillmentMethod)??'pickup'});
    case 'FULFILLMENT_EXCEPTION':
      return build(input,ctx,'FULFILLMENT_EXCEPTION',{order:ctx.orderLabel,status:text(payload.kind)??'fulfillment exception'});
    case 'REFUND_AUTHORIZED':
    case 'REMEDY_AUTHORIZED': {
      const amount=money(payload.amount);if(!amount)throw new Error('COMMUNICATION_REFUND_EVIDENCE_INCOMPLETE');
      return build(input,ctx,'REFUND_AUTHORIZED',{amount,order:ctx.orderLabel});
    }
    case 'REFUND_PROCESSING': {
      const amount=money(payload.amount),reference=text(payload.providerReference);if(!amount||!reference)throw new Error('COMMUNICATION_REFUND_EVIDENCE_INCOMPLETE');
      return build(input,ctx,'REFUND_PROCESSING',{amount,order:ctx.orderLabel,reference});
    }
    case 'REFUND_COMPLETED':
    case 'REMEDY_COMPLETED': {
      const amount=money(payload.amount),reference=text(payload.providerReference);if(!amount||!reference)throw new Error('COMMUNICATION_REFUND_EVIDENCE_INCOMPLETE');
      return build(input,ctx,'REFUND_COMPLETED',{amount,order:ctx.orderLabel,reference});
    }
    default:
      return undefined;
  }
}
