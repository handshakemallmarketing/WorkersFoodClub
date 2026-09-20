import { randomUUID } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

function requireApplicationAccess(env){if((env.VERCEL_ENV||'unknown')==='preview')return{ok:true};return requireProductionApplicationAccess(env);}
const clean=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const emailOk=v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function reviewMode(env){return String(env.MEMBERSHIP_APPLICATION_REVIEW_MODE||'AUTO').toUpperCase()==='MANUAL'?'MANUAL':'AUTO';}

/**
 * Self-service guest enrollment. No identity-provider authentication is required.
 * AUTO (default): submission provisions an INACTIVE membership and annual invoice immediately;
 * settlement remains the activation boundary. MANUAL: application waits for optional governed review.
 * Neither path creates a login identity binding or member-area authority.
 */
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const env=options.env||process.env,access=requireApplicationAccess(env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
 const fullName=clean(req.body?.fullName,200),email=clean(req.body?.email,320)?.toLowerCase()||null,phone=clean(req.body?.phone,40),governmentEmployer=clean(req.body?.governmentEmployer,240),contactNote=clean(req.body?.contactNote,2000);
 if(!fullName)return res.status(400).json({ok:false,error:'FULL_NAME_REQUIRED'});
 if(!email&&!phone)return res.status(400).json({ok:false,error:'EMAIL_OR_PHONE_REQUIRED'});
 if(!emailOk(email))return res.status(400).json({ok:false,error:'EMAIL_INVALID'});
 if(!governmentEmployer)return res.status(400).json({ok:false,error:'GOVERNMENT_EMPLOYER_REQUIRED'});
 const mode=reviewMode(env),annualFeeMinor=Number(options.annualFeeMinor??env.ANNUAL_MEMBERSHIP_FEE_MINOR);
 if(mode==='AUTO'&&(!Number.isSafeInteger(annualFeeMinor)||annualFeeMinor<=0))return res.status(503).json({ok:false,error:'ANNUAL_MEMBERSHIP_FEE_NOT_CONFIGURED'});
 const connectionString=options.databaseUrl||env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{
  let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
  const applicationId=`application:${randomUUID()}`,applicantReference=`applicant:${randomUUID()}`,nowIso=new Date(options.now??Date.now()).toISOString();
  if(mode==='MANUAL'){
   await sql`INSERT INTO membership_application(application_id,issuer,subject,full_name,email,phone,government_employer,applicant_reference,contact_note,review_mode,review_status) VALUES (${applicationId},NULL,NULL,${fullName},${email},${phone},${governmentEmployer},${applicantReference},${contactNote},'MANUAL','PENDING')`;
   res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,applicationId,applicantReference,state:'SUBMITTED',reviewRequired:true,membershipProvisioned:false});
  }
  const participantId=`participant:${randomUUID()}`,membershipId=`membership:${randomUUID()}`,invoiceId=`subscription-invoice:${randomUUID()}`,subscriptionYear=new Date(nowIso).getUTCFullYear(),dueAt=new Date(Date.parse(nowIso)+14*86400000).toISOString();
  const rows=await sql`WITH app AS (
    INSERT INTO membership_application(application_id,issuer,subject,full_name,email,phone,government_employer,applicant_reference,contact_note,state,review_mode,review_status)
    VALUES (${applicationId},NULL,NULL,${fullName},${email},${phone},${governmentEmployer},${applicantReference},${contactNote},'APPROVED','AUTO','NOT_REQUIRED') RETURNING application_id
  ), participant AS (
    INSERT INTO application_participant(participant_id,kind,state) SELECT ${participantId},'PERSON','ACTIVE' FROM app RETURNING participant_id
  ), membership AS (
    INSERT INTO application_membership(membership_id,participant_id,state,member_type,standing,established_at,eligibility_policy_version,eligibility_evidence_ids)
    SELECT ${membershipId},participant_id,'INACTIVE','PRIMARY','INITIAL_FEE_DUE',${nowIso},'self-service-membership-v1',ARRAY[${applicationId}] FROM participant RETURNING membership_id
  ), invoice AS (
    INSERT INTO membership_subscription_invoice(invoice_id,membership_id,subscription_year,amount_minor,currency,state,due_at)
    SELECT ${invoiceId},membership_id,${subscriptionYear},${annualFeeMinor},'GHS','OPEN',${dueAt} FROM membership RETURNING invoice_id
  ), linked AS (
    UPDATE membership_application SET resulting_membership_id=${membershipId} WHERE application_id=${applicationId} AND EXISTS(SELECT 1 FROM invoice) RETURNING application_id
  ) SELECT application_id FROM linked`;
  if(rows.length!==1)throw new Error('SELF_SERVICE_PROVISION_FAILED');
  res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,applicationId,applicantReference,state:'APPROVED',reviewRequired:false,membershipProvisioned:true,membershipId,membershipState:'INACTIVE',standing:'INITIAL_FEE_DUE',invoiceId,dueAt,loginIdentityBound:false});
 }catch(error){console.error('Membership application submission failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBERSHIP_APPLY_FAILED'});}
}
