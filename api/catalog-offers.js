import { requireApplicationAuth } from '../lib/application-auth.js';
import { CATALOG_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';
const ID=/^[A-Za-z0-9:_-]{1,120}$/;
function positive(v,nullable=false){if(v==null&&nullable)return null;const n=Number(v);return Number.isFinite(n)&&n>0?n:NaN;}
function iso(v,nullable=true){if((v==null||v==='')&&nullable)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():undefined;}
export default async function handler(req,res){
 if(!['POST','PATCH','DELETE'].includes(req.method)){res.setHeader('Allow','POST, PATCH, DELETE');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const principal=await requireApplicationAuth(req,res,'operator:catalog.manage',CATALOG_CAPABLE_OPERATORS);if(!principal)return;
 const cs=process.env.DATABASE_URL;if(!cs)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 const b=req.body||{},offerId=typeof b.offerId==='string'?b.offerId.trim():'';if(!ID.test(offerId))return res.status(400).json({ok:false,error:'OFFER_ID_INVALID'});
 try{
  const {neon}=await import('@neondatabase/serverless');const sql=neon(cs,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  if(req.method==='DELETE'){const rows=await sql`UPDATE preview_member_offer SET status='CLOSED',updated_at=now() WHERE offer_id=${offerId} RETURNING offer_id,status,updated_at`;if(!rows[0])return res.status(404).json({ok:false,error:'OFFER_NOT_FOUND'});return res.status(200).json({ok:true,offer:{offerId,status:'CLOSED'}});}
  const name=typeof b.name==='string'?b.name.trim():'',description=typeof b.description==='string'?b.description.trim():'',unit=typeof b.unit==='string'?b.unit.trim():'',method=b.fulfillmentMethod,status=b.status||'COMING_SOON';
  const unitQuantity=positive(b.unitQuantity),priceMinor=Number(b.priceMinor),min=positive(b.minOrderQuantity,true),max=positive(b.maxOrderQuantity,true),capacity=positive(b.campaignCapacity,true),sort=Number.isInteger(b.sortOrder)?b.sortOrder:0;
  const deliveryAt=iso(b.deliveryAt),discountDeadlineAt=iso(b.discountDeadlineAt),discountBps=b.fullPaymentDiscountBps==null?0:Number(b.fullPaymentDiscountBps);
  if(!name||!description||!unit||!Number.isFinite(unitQuantity)||!Number.isInteger(priceMinor)||priceMinor<0||!['PICKUP','DELIVERY'].includes(method)||!['OPEN','COMING_SOON','CLOSED'].includes(status)||Number.isNaN(min)||Number.isNaN(max)||Number.isNaN(capacity)||(min!=null&&max!=null&&max<min)||deliveryAt===undefined||discountDeadlineAt===undefined||!Number.isInteger(discountBps)||discountBps<0||discountBps>10000)return res.status(400).json({ok:false,error:'OFFER_FIELDS_INVALID'});
  if(req.method==='POST'){
   const rows=await sql`INSERT INTO preview_member_offer(offer_id,name,description,unit_quantity,unit,price_minor,currency,fulfillment_method,status,sort_order,min_order_quantity,max_order_quantity,campaign_capacity,delivery_at,full_payment_discount_bps,discount_deadline_at,updated_at) VALUES(${offerId},${name},${description},${unitQuantity},${unit},${priceMinor},'GHS',${method},${status},${sort},${min},${max},${capacity},${deliveryAt},${discountBps},${discountDeadlineAt},now()) ON CONFLICT(offer_id) DO NOTHING RETURNING offer_id,status`;
   if(!rows[0])return res.status(409).json({ok:false,error:'OFFER_ALREADY_EXISTS'});return res.status(201).json({ok:true,offer:{offerId,status:String(rows[0].status)}});
  }
  const rows=await sql`UPDATE preview_member_offer SET name=${name},description=${description},unit_quantity=${unitQuantity},unit=${unit},price_minor=${priceMinor},currency='GHS',fulfillment_method=${method},status=${status},sort_order=${sort},min_order_quantity=${min},max_order_quantity=${max},campaign_capacity=${capacity},delivery_at=${deliveryAt},full_payment_discount_bps=${discountBps},discount_deadline_at=${discountDeadlineAt},updated_at=now() WHERE offer_id=${offerId} RETURNING offer_id,status`;
  if(!rows[0])return res.status(404).json({ok:false,error:'OFFER_NOT_FOUND'});return res.status(200).json({ok:true,offer:{offerId,status:String(rows[0].status)}});
 }catch(e){console.error('Catalog mutation failed',{name:e?.name,code:e?.code,message:e?.message});return res.status(503).json({ok:false,error:'CATALOG_MUTATION_FAILED'});}
}
