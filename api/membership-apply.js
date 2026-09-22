import { randomUUID } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { normalizeSmsRecipient } from '../lib/member-auth-challenge-delivery.js';

function requireApplicationAccess(env){if((env.VERCEL_ENV||'unknown')==='preview')return{ok:true};return requireProductionApplicationAccess(env);}
const clean=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const emailOk=v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function reviewMode(env){return String(env.MEMBERSHIP_APPLICATION_REVIEW_MODE||'AUTO').toUpperCase()==='MANUAL'?'MANUAL':'AUTO';}

/** Enrollment creates membership identity first. Annual billing is a separate downstream operation. */
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const env=options.env||process.env,access=requireApplicationAccess(env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
 const fullName=clean(req.body?.fullName,200),email=clean(req.body?.email,320)?.toLowerCase()||null,phoneInput=clean(req.body?.phone,40),governmentEmployer=clean(req.body?.governmentEmployer,240),contactNote=clean(req.body?.contactNote,2000);
 if(!fullName)return res.status(400).json({ok:false,error:'FULL_NAME_REQUIRED'});if(!email&&!phoneInput)return res.status(400).json({ok:false,error:'EMAIL_OR_PHONE_REQUIRED'});if(!emailOk(email))return res.status(400).json({ok:false,error:'EMAIL_INVALID'});if(!governmentEmployer)return res.status(400).json({ok:false,error:'GOVERNMENT_EMPLOYER_REQUIRED'});
 const mode=reviewMode(env);let phone=phoneInput;
 if(mode==='AUTO'){try{phone=normalizeSmsRecipient(phoneInput,{defaultCountryCode:String(env.MEMBER_PHONE_DEFAULT_COUNTRY_CODE||'233')});}catch{return res.status(400).json({ok:false,error:'PHONE_INVALID'});}}
 const connectionString=options.databaseUrl||env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 let stage='CONNECT_DATABASE';
 try{
  let sql=options.sql;if(!sql){const{neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
  const applicationId=`application:${randomUUID()}`,applicantReference=`applicant:${randomUUID()}`;
  if(mode==='MANUAL'){stage='CREATE_APPLICATION';await sql`INSERT INTO membership_application(application_id,issuer,subject,full_name,email,phone,government_employer,applicant_reference,contact_note,review_mode,review_status) VALUES (${applicationId},NULL,NULL,${fullName},${email},${phone},${governmentEmployer},${applicantReference},${contactNote},'MANUAL','PENDING')`;res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,applicationId,applicantReference,state:'SUBMITTED',reviewRequired:true,membershipProvisioned:false});}
  // AUTO mode no longer provisions a membership directly from this endpoint (BLV2-DEC-031:
  // contact verification must precede provisioning). Callers must use
  // /api/enrollment-verify-start and /api/enrollment-verify-complete instead.
  return res.status(410).json({ok:false,error:'ENROLLMENT_FLOW_MOVED',useEndpoint:'/api/enrollment-verify-start'});
 }catch(error){const failureCode=String(error?.code||'MEMBERSHIP_APPLY_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,80);console.error('Membership application submission failed',{stage,name:error?.name,code:error?.code,message:error?.message});res.setHeader('Cache-Control','no-store');return res.status(503).json({ok:false,error:'MEMBERSHIP_APPLY_FAILED',stage,failureCode});}
}
