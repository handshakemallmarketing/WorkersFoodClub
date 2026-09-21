import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { ensureAnnualMembershipInvoice } from '../lib/membership-annual-invoice.js';

/** Internal renewal billing boundary. Caller authority is a deployment secret; no browser role claims. */
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const env=options.env||process.env,access=requireProductionApplicationAccess(env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
 const authorize=options.authorizeRenewal||((request)=>{const expected=env.MEMBERSHIP_RENEWAL_AUTHORITY_TOKEN,got=request.headers?.['x-membership-renewal-authority'];return typeof expected==='string'&&expected.length>=32&&got===expected;});if(!authorize(req))return res.status(401).json({ok:false,error:'RENEWAL_AUTHORITY_REQUIRED'});
 const membershipId=req.body?.membershipId;if(typeof membershipId!=='string'||!membershipId)return res.status(400).json({ok:false,error:'MEMBERSHIP_ID_REQUIRED'});
 const connectionString=options.databaseUrl||env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{
  let sql=options.sql;if(!sql){const{neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
  const members=await sql`SELECT membership_id,public_member_id,state,standing,member_type FROM application_membership WHERE membership_id=${membershipId} LIMIT 1`;if(members.length!==1)return res.status(404).json({ok:false,error:'MEMBERSHIP_NOT_FOUND'});const member=members[0];
  if(String(member.member_type)!=='PRIMARY')return res.status(409).json({ok:false,error:'PRIMARY_SUBSCRIPTION_REQUIRED'});if(!member.public_member_id)return res.status(409).json({ok:false,error:'MEMBER_NUMBER_NOT_ISSUED'});
  const state=String(member.state),standing=String(member.standing);const renewalDue=state==='SUSPENDED'||standing==='GRACE'||standing==='RESTRICTED'||standing==='SUSPENDED';if(!renewalDue)return res.status(409).json({ok:false,error:'MEMBERSHIP_NOT_RENEWAL_DUE'});
  const invoice=await ensureAnnualMembershipInvoice({sql,membershipId,publicMemberId:String(member.public_member_id),now:options.now??Date.now(),env,amountMinor:options.annualFeeMinor,subscriptionYear:options.subscriptionYear});
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,...invoice,renewal:true});
 }catch(error){const failureCode=String(error?.code||'MEMBERSHIP_RENEWAL_INVOICE_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,80);console.error('Membership renewal invoice failed',{code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBERSHIP_RENEWAL_INVOICE_FAILED',failureCode});}
}
