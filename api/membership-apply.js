import { randomUUID } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

function requireApplicationAccess(env) {
  if ((env.VERCEL_ENV || 'unknown') === 'preview') return { ok: true };
  return requireProductionApplicationAccess(env);
}
const clean=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const emailOk=v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Guest enrollment. No Google/OIDC authentication is required or accepted as enrollment authority. */
export default async function handler(req,res,options={}) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const env=options.env||process.env, access=requireApplicationAccess(env);
  if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
  const fullName=clean(req.body?.fullName,200), email=clean(req.body?.email,320)?.toLowerCase()||null, phone=clean(req.body?.phone,40), contactNote=clean(req.body?.contactNote,2000);
  if(!fullName)return res.status(400).json({ok:false,error:'FULL_NAME_REQUIRED'});
  if(!email&&!phone)return res.status(400).json({ok:false,error:'EMAIL_OR_PHONE_REQUIRED'});
  if(!emailOk(email))return res.status(400).json({ok:false,error:'EMAIL_INVALID'});
  const connectionString=options.databaseUrl||process.env.DATABASE_URL;
  if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try{
    let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
    const existing=await sql`SELECT application_id FROM membership_application WHERE state='SUBMITTED' AND ((${email} IS NOT NULL AND lower(email)=lower(${email})) OR (${phone} IS NOT NULL AND phone=${phone})) ORDER BY submitted_at DESC LIMIT 1`;
    if(existing.length){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,applicationId:String(existing[0].application_id),state:'SUBMITTED',alreadySubmitted:true});}
    const applicationId=`application:${randomUUID()}`, applicantReference=`applicant:${randomUUID()}`;
    await sql`INSERT INTO membership_application(application_id,issuer,subject,full_name,email,phone,applicant_reference,contact_note) VALUES (${applicationId},NULL,NULL,${fullName},${email},${phone},${applicantReference},${contactNote})`;
    res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,applicationId,state:'SUBMITTED',alreadySubmitted:false});
  }catch(error){console.error('Membership application submission failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBERSHIP_APPLY_FAILED'});}
}
