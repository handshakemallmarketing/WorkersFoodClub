import { randomBytes } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

const MEMBER_SCOPES = ['member:purchase.commit','member:payment.execute','member:fulfillment.accept','member:orders.read','member:notifications.read','member:engagement.survey'];
function newPrimaryMemberId(){return `WFC-P-${randomBytes(6).toString('hex').toUpperCase()}`;}

/** Consumes already-verified annual-subscription settlement evidence. It never charges money. */
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const access=requireProductionApplicationAccess(options.env||process.env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
 const verified=await verifyProductionOidcRequest(req,undefined,undefined,options.production||{});if(!verified.ok)return res.status(verified.status).json({ok:false,error:verified.error});
 const invoiceId=req.body?.invoiceId,evidenceId=req.body?.settlementEvidenceId;
 if(typeof invoiceId!=='string'||!invoiceId)return res.status(400).json({ok:false,error:'INVOICE_ID_REQUIRED'});
 if(typeof evidenceId!=='string'||!evidenceId)return res.status(400).json({ok:false,error:'SETTLEMENT_EVIDENCE_ID_REQUIRED'});
 const connectionString=options.databaseUrl||process.env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{
  let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
  const bindings=await sql`SELECT participant_id,state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
  if(bindings.length!==1||String(bindings[0].state)!=='ACTIVE')return res.status(403).json({ok:false,error:'APPLICATION_IDENTITY_NOT_BOUND'});
  const participantId=String(bindings[0].participant_id);
  const invoices=await sql`SELECT i.invoice_id,i.membership_id,i.state,i.settlement_evidence_id,m.participant_id,m.state AS membership_state,m.standing,m.member_type,m.public_member_id FROM membership_subscription_invoice i JOIN application_membership m ON m.membership_id=i.membership_id WHERE i.invoice_id=${invoiceId} LIMIT 1`;
  if(invoices.length!==1)return res.status(404).json({ok:false,error:'SUBSCRIPTION_INVOICE_NOT_FOUND'});const invoice=invoices[0];
  if(String(invoice.participant_id)!==participantId)return res.status(403).json({ok:false,error:'SUBSCRIPTION_INVOICE_NOT_OWNED'});
  if(String(invoice.member_type)!=='PRIMARY')return res.status(409).json({ok:false,error:'PRIMARY_SUBSCRIPTION_REQUIRED'});
  if(String(invoice.state)==='PAID'){
   if(String(invoice.settlement_evidence_id)!==evidenceId)return res.status(409).json({ok:false,error:'INVOICE_ALREADY_SETTLED_DIFFERENT_EVIDENCE'});
   if(!invoice.public_member_id)return res.status(409).json({ok:false,error:'ACTIVE_MEMBER_ID_MISSING'});
   res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,idempotent:true,invoiceId,membershipId:String(invoice.membership_id),publicMemberId:String(invoice.public_member_id),membershipState:'ACTIVE',standing:'CURRENT'});
  }
  if(String(invoice.state)!=='OPEN')return res.status(409).json({ok:false,error:'SUBSCRIPTION_INVOICE_NOT_OPEN'});
  if(!['INACTIVE','SUSPENDED'].includes(String(invoice.membership_state)))return res.status(409).json({ok:false,error:'MEMBERSHIP_NOT_ACTIVATABLE'});
  const nowIso=new Date(options.now??Date.now()).toISOString();const publicMemberId=invoice.public_member_id?String(invoice.public_member_id):newPrimaryMemberId();
  const settled=await sql`UPDATE membership_subscription_invoice SET state='PAID',paid_at=${nowIso},settlement_evidence_id=${evidenceId} WHERE invoice_id=${invoiceId} AND state='OPEN' RETURNING invoice_id`;
  if(settled.length!==1)return res.status(409).json({ok:false,error:'SUBSCRIPTION_SETTLEMENT_RACE'});
  const activated=await sql`UPDATE application_membership SET state='ACTIVE',standing='CURRENT',public_member_id=COALESCE(public_member_id,${publicMemberId}),activated_at=COALESCE(activated_at,${nowIso}),suspended_at=NULL WHERE membership_id=${String(invoice.membership_id)} AND state IN ('INACTIVE','SUSPENDED') RETURNING public_member_id`;
  if(activated.length!==1||!activated[0].public_member_id)return res.status(409).json({ok:false,error:'MEMBERSHIP_ACTIVATION_RACE'});
  await sql`UPDATE application_identity_binding SET scopes=${MEMBER_SCOPES} WHERE participant_id=${participantId} AND state='ACTIVE'`;
  await sql`INSERT INTO application_access_audit(audit_id,participant_id,membership_id,event_type,state,outcome,request_id,occurred_at) VALUES (${`audit:subscription:${evidenceId}`},${participantId},${String(invoice.membership_id)},'MEMBERSHIP_SUBSCRIPTION_SETTLED','ACTIVE_CURRENT','TRANSITION',${req.headers?.['x-request-id']||null},${nowIso}) ON CONFLICT (audit_id) DO NOTHING`;
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,idempotent:false,invoiceId,membershipId:String(invoice.membership_id),publicMemberId:String(activated[0].public_member_id),membershipState:'ACTIVE',standing:'CURRENT'});
 }catch(error){console.error('Membership subscription settlement failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'SUBSCRIPTION_SETTLEMENT_FAILED'});}
}
