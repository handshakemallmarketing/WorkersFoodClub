import type {CommandId,ObligationId,OfferId,ParticipantId,Quantity} from '../../kernel/src/index.js';
import type {AuthenticatedPrincipal} from '../../identity/src/index.js';
import {PilotIdentityMembershipService} from '../../identity/src/index.js';
import {GovernedPilotCatalogService} from '../../pilot-catalog/src/index.js';
import {InMemoryDemandCommitmentLedger,type PurchaseCommitmentRecord} from '../../demand/src/index.js';

export interface CartLine {readonly offerId:OfferId;readonly quantity:Quantity;}
export interface PreorderCart {readonly id:string;readonly participantId:ParticipantId;readonly line:CartLine;readonly createdAt:string;readonly state:'OPEN'|'CHECKED_OUT';}
export interface CheckoutAuthorization {readonly commandId:CommandId;readonly eventId:string;readonly acceptedAt:string;readonly policyVersions:readonly string[];}

export class PilotCheckoutService {
 private readonly carts=new Map<string,PreorderCart>();
 constructor(private readonly identity:PilotIdentityMembershipService,private readonly catalog:GovernedPilotCatalogService,private readonly demand:InMemoryDemandCommitmentLedger){}

 createCart(input:{cartId:string;principal:AuthenticatedPrincipal;offerId:OfferId;quantity:Quantity;at:string;listingId:string;benchmarkDisplayId:string}):PreorderCart{
  if(this.carts.has(input.cartId)) throw new Error('CART_ID_DUPLICATE');
  const member=this.identity.resolveActiveMember(input.principal);
  const view=this.catalog.catalogView({listingId:input.listingId,offerId:input.offerId,benchmarkDisplayId:input.benchmarkDisplayId,at:input.at});
  if(input.quantity.amount<=0||input.quantity.unit!==view.offer.quantity.unit||input.quantity.amount>view.offer.quantity.amount) throw new Error('CART_QUANTITY_OUT_OF_OFFER');
  const cart=Object.freeze({id:input.cartId,participantId:member.participant.id,line:Object.freeze({offerId:input.offerId,quantity:Object.freeze({...input.quantity})}),createdAt:input.at,state:'OPEN' as const});
  this.carts.set(cart.id,cart);return cart;
 }

 async checkout(input:{cartId:string;principal:AuthenticatedPrincipal;listingId:string;benchmarkDisplayId:string;obligationId:ObligationId;authorization:CheckoutAuthorization}):Promise<PurchaseCommitmentRecord>{
  const cart=this.carts.get(input.cartId);if(!cart) throw new Error('CART_NOT_FOUND');if(cart.state!=='OPEN') throw new Error('CART_ALREADY_CHECKED_OUT');
  const member=this.identity.resolveActiveMember(input.principal);if(member.participant.id!==cart.participantId) throw new Error('CART_PARTICIPANT_MISMATCH');
  const view=this.catalog.catalogView({listingId:input.listingId,offerId:cart.line.offerId,benchmarkDisplayId:input.benchmarkDisplayId,at:input.authorization.acceptedAt});
  // Cart is non-binding. Only a separately accepted command/event may create the purchase obligation.
  const commitment=await this.demand.commitPurchase({obligationId:input.obligationId,participantId:member.participant.id,membership:member.membership,offer:view.offer,quantity:cart.line.quantity,authorizedCommandId:input.authorization.commandId,authorizedEventId:input.authorization.eventId,acceptedAt:input.authorization.acceptedAt,policyVersions:input.authorization.policyVersions});
  this.carts.set(cart.id,Object.freeze({...cart,state:'CHECKED_OUT'}));return commitment;
 }
 getCart(id:string){return this.carts.get(id);}
}
