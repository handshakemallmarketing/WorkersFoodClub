import { randomBytes, randomUUID } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { ensureAnnualMembershipInvoice } from '../lib/membership-annual-invoice.js';

function requireApplicationAccess(env){if((env.VERCEL_ENV||'unknown')==='preview')return{ok:true};return requireProductionApplicationAccess(env);}
const clean=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const emailOk=v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function reviewMode(env){return String(env.MEMBERSHIP_APPLICATION_REVIEW_MODE||'AUTO').toUpperCase()==='MANUAL'?'MANUAL':'AUTO';}
function newPrimaryMemberId(){return `WFC-P-${randomBytes(6).toString('hex').toUpperCase()}`;}

/** Enrollment creates membership identity first. Annual billing is a separate downstream operation. */
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const env=options.env||process.env,access=requireApplicationAccess(env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
 const fullName=clean(req.body?.fullName,200),email=clean(req.body?.email,320)?.toLowerCase()||null,phone=clean(req.body?.phone,40),governmentEmployer=clean(req.body?.governmentEmployer,240),contactNote=clean(req.body?.contactNote,2000);
 if(!fullName)return res.status(400).json({ok:false,error:'FULL_NAME_REQUIRED'});if(!email&&!phone)return res.status(400).json({ok:false,error:'EMAIL_OR_PHONE_REQUIRED'});if(!emailOk(email))return res.status(400).json({ok:false,error:'EMAIL_INVALID'});if(!governmentEmployer)return res.status(400).json({ok:false,error:'GOVERNMENT_EMPLOYER_REQUIRED'});
 const mode=reviewMode(env),connectionString=options.databaseUrl||env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 let stage='CONNECT_DATABASE';
 try{
  let sql=options.sql;if(!sql){const{neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
  const applicationId=`application:${randomUUID()}`,applicantReference=`applicant:${randomUUID()}`,now=options.now??Date.now(),nowIso=new Date(now).toISOString();
  if(mode==='MANUAL'){stage='CREATE_APPLICATION';await sql`INSERT INTO membership_application(application_id,issuer,subject,full_name,email,phone,government_employer,applicant_reference,contact_note,review_mode,review_status) VALUES (${applicationId},NULL,NULL,${fullName},${email},${phone},${governmentEmployer},${applicantReference},${contactNote},'MANUAL','PENDING')`;res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,applicationId,applicantReference,state:'SUBMITTED',reviewRequired:true,membershipProvisioned:false});}
  const participantId=`participant:${randomUUID()}`,membershipId=`membership:${randomUUID()}`,publicMemberId=newPrimaryMemberId();
  stage='CREATE_MEMBERSHIP_RECORD';
  const rows=await sql`WITH participant AS (INSERT INTO application_participant(participant_id,kind,state) VALUES (${participantId},'PERSON','ACTIVE') RETURNING participant_id), membership AS (INSERT INTO application_membership(membership_id,participant_id,state,member_type,standing,established_at,eligibility_policy_version,eligibility_evidence_ids,public_member_id) SELECT ${membershipId},participant_id,'INACTIVE','PRIMARY','INITIAL_FEE_DUE',${nowIso},'self-service-membership-v2',ARRAY[${applicationId}],${publicMemberId} FROM participant RETURNING membership_id) INSERT INTO membership_application(application_id,issuer,subject,full_name,email,phone,government_employer,applicant_reference,contact_note,state,review_mode,review_status,decided_at,resulting_membership_id) SELECT ${applicationId},NULL,NULL,${fullName},${email},${phone},${governmentEmployer},${applicantReference},${contactNote},'SUBMITTED','AUTO','NOT_REQUIRED',NULL,membership_id FROM membership RETURNING application_id,resulting_membership_id`;
  if(rows.length!==1||rows[0].resulting_membership_id!==membershipId)throw Object.assign(new Error('MEMBERSHIP_RECORD_CREATION_FAILED'),{code:'MEMBERSHIP_RECORD_CREATION_FAILED'});
  stage='CREATE_ANNUAL_SUBSCRIPTION_INVOICE';
  try{
   const invoice=await ensureAnnualMembershipInvoice({sql,membershipId,publicMemberId,now,env,amountMinor:options.annualFeeMinor});
   res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,applicationId,applicantReference,state:'SUBMITTED',reviewRequired:false,membershipProvisioned:true,membershipId,publicMemberId,membershipState:'INACTIVE',standing:'INITIAL_FEE_DUE',subscriptionInvoicePending:false,invoiceId:invoice.invoiceId,invoiceState:invoice.state,subscriptionYear:invoice.subscriptionYear,invoiceAmountMinor:invoice.amountMinor,invoiceCurrency:invoice.currency,dueAt:invoice.dueAt,loginIdentityBound:false});
  }catch(invoiceError){
   const billingError=String(invoiceError?.code||'ANNUAL_SUBSCRIPTION_INVOICE_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,80);console.error('Membership created but annual invoice pending',{membershipId,publicMemberId,code:invoiceError?.code,message:invoiceError?.message});
   res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,applicationId,applicantReference,state:'SUBMITTED',reviewRequired:false,membershipProvisioned:true,membershipId,publicMemberId,membershipState:'INACTIVE',standing:'INITIAL_FEE_DUE',subscriptionInvoicePending:true,billingStatus:'PENDING_RETRY',billingError,loginIdentityBound:false});
  }
 }catch(error){const failureCode=String(error?.code||'MEMBERSHIP_APPLY_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,80);console.error('Membership application submission failed',{stage,name:error?.name,code:error?.code,message:error?.message});res.setHeader('Cache-Control','no-store');return res.status(503).json({ok:false,error:'MEMBERSHIP_APPLY_FAILED',stage,failureCode});}
}
