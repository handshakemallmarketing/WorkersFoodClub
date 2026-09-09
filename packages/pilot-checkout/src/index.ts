import type {CommandId,ObligationId,OfferId,ParticipantId,Quantity} from '../../kernel/src/index.js';
import type {MembershipRelationship} from '../../membership/src/index.js';
import type {MemberOffer} from '../../catalog/src/index.js';
import {InMemoryDemandCommitmentLedger,type PurchaseCommitmentRecord} from '../../demand/src/index.js';

export type CartState='OPEN'|'CHECKING_OUT'|'CHECKED_OUT'|'ABANDONED';
export interface CartLine {readonly offerId:OfferId;readonly quantity:Quantity;}
export interface PilotCart {readonly id:string;readonly participantId:ParticipantId;readonly state:CartState;readonly lines:readonly CartLine[];readonly createdAt:string;readonly updatedAt:string;readonly checkoutObligationId?:ObligationId;readonly checkoutReservationId?:string;}

const validTime=(value:string)=>{if(Number.isNaN(Date.parse(value))) throw new Error('CART_TIME_INVALID');};

export class InMemoryPilotCartStore {
 private readonly carts=new Map<string,PilotCart>();
 create(input:{id:string;participantId:ParticipantId;at:string}):PilotCart{
  if(this.carts.has(input.id)) throw new Error('CART_ID_DUPLICATE');validTime(input.at);
  const cart:PilotCart=Object.freeze({id:input.id,participantId:input.participantId,state:'OPEN',lines:[],createdAt:input.at,updatedAt:input.at});this.carts.set(input.id,cart);return cart;
 }
 setSingleLine(input:{cartId:string;participantId:ParticipantId;offer:MemberOffer;quantity:Quantity;at:string}):PilotCart{
  validTime(input.at);const cart=this.requireOpen(input.cartId,input.participantId);
  if(input.quantity.amount<=0||input.quantity.unit!==input.offer.quantity.unit||input.quantity.amount>input.offer.quantity.amount) throw new Error('CART_QUANTITY_OUT_OF_OFFER');
  const next:PilotCart=Object.freeze({...cart,lines:[Object.freeze({offerId:input.offer.id,quantity:Object.freeze({...input.quantity})})],updatedAt:input.at});this.carts.set(cart.id,next);return next;
 }
 abandon(input:{cartId:string;participantId:ParticipantId;at:string}):PilotCart{validTime(input.at);const cart=this.requireOpen(input.cartId,input.participantId);const next:PilotCart=Object.freeze({...cart,state:'ABANDONED',updatedAt:input.at});this.carts.set(cart.id,next);return next;}
 reserveCheckout(input:{cartId:string;participantId:ParticipantId;reservationId:string;obligationId:ObligationId;at:string}):PilotCart{
  validTime(input.at);if(!input.reservationId.trim()) throw new Error('CHECKOUT_RESERVATION_REQUIRED');const cart=this.requireOpen(input.cartId,input.participantId);
  const next:PilotCart=Object.freeze({...cart,state:'CHECKING_OUT',checkoutObligationId:input.obligationId,checkoutReservationId:input.reservationId,updatedAt:input.at});this.carts.set(cart.id,next);return next;
 }
 releaseCheckout(input:{cartId:string;participantId:ParticipantId;reservationId:string;at:string}):PilotCart{
  validTime(input.at);const cart=this.requireReservation(input.cartId,input.participantId,input.reservationId);const {checkoutObligationId:_o,checkoutReservationId:_r,...rest}=cart;const next:PilotCart=Object.freeze({...rest,state:'OPEN',updatedAt:input.at});this.carts.set(cart.id,next);return next;
 }
 markCheckedOut(input:{cartId:string;participantId:ParticipantId;reservationId:string;obligationId:ObligationId;at:string}):PilotCart{
  validTime(input.at);const cart=this.requireReservation(input.cartId,input.participantId,input.reservationId);if(cart.checkoutObligationId!==input.obligationId) throw new Error('CHECKOUT_OBLIGATION_MISMATCH');const next:PilotCart=Object.freeze({...cart,state:'CHECKED_OUT',updatedAt:input.at});this.carts.set(cart.id,next);return next;
 }
 get(id:string){return this.carts.get(id);}
 private requireOpen(id:string,participantId:ParticipantId){const cart=this.carts.get(id);if(!cart) throw new Error('CART_NOT_FOUND');if(cart.participantId!==participantId) throw new Error('CART_PARTICIPANT_MISMATCH');if(cart.state!=='OPEN') throw new Error('CART_NOT_OPEN');return cart;}
 private requireReservation(id:string,participantId:ParticipantId,reservationId:string){const cart=this.carts.get(id);if(!cart) throw new Error('CART_NOT_FOUND');if(cart.participantId!==participantId) throw new Error('CART_PARTICIPANT_MISMATCH');if(cart.state!=='CHECKING_OUT'||cart.checkoutReservationId!==reservationId) throw new Error('CHECKOUT_RESERVATION_NOT_OWNED');return cart;}
}

export class PilotCheckoutService {
 constructor(private readonly carts:InMemoryPilotCartStore,private readonly commitments:InMemoryDemandCommitmentLedger){}
 async checkout(input:{cartId:string;participantId:ParticipantId;membership:MembershipRelationship;offer:MemberOffer;obligationId:ObligationId;authorizedCommandId:CommandId;authorizedEventId:string;acceptedAt:string;policyVersions:readonly string[]}):Promise<PurchaseCommitmentRecord>{
  const cart=this.carts.get(input.cartId);if(!cart) throw new Error('CART_NOT_FOUND');if(cart.participantId!==input.participantId) throw new Error('CART_PARTICIPANT_MISMATCH');if(cart.state!=='OPEN') throw new Error('CART_NOT_OPEN');if(cart.lines.length!==1) throw new Error('CHECKOUT_REQUIRES_SINGLE_CART_LINE');
  const line=cart.lines[0]!;if(line.offerId!==input.offer.id) throw new Error('CART_OFFER_MISMATCH');
  const reservationId=`${String(input.authorizedCommandId)}:${input.authorizedEventId}`;
  this.carts.reserveCheckout({cartId:input.cartId,participantId:input.participantId,reservationId,obligationId:input.obligationId,at:input.acceptedAt});
  try{
   const commitment=await this.commitments.commitPurchase({obligationId:input.obligationId,participantId:input.participantId,membership:input.membership,offer:input.offer,quantity:line.quantity,authorizedCommandId:input.authorizedCommandId,authorizedEventId:input.authorizedEventId,acceptedAt:input.acceptedAt,policyVersions:input.policyVersions});
   this.carts.markCheckedOut({cartId:input.cartId,participantId:input.participantId,reservationId,obligationId:input.obligationId,at:input.acceptedAt});return commitment;
  }catch(error){
   const current=this.carts.get(input.cartId);if(current?.state==='CHECKING_OUT'&&current.checkoutReservationId===reservationId)this.carts.releaseCheckout({cartId:input.cartId,participantId:input.participantId,reservationId,at:input.acceptedAt});
   throw error;
  }
 }
}
