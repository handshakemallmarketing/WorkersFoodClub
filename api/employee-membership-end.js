import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

/**
 * Reconcile ended employment into sponsorship termination. This intentionally
 * does NOT terminate membership: the member enters the ordinary fee lifecycle
 * and may continue by paying the annual subscription. Operator authority is
 * also untouched here and must be revoked through its own state machine.
 */
export default async function handler(req,res,options={}) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const access=requireProductionApplicationAccess(options.env||process.env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
  const employmentRecordId=req.body?.employmentRecordId;if(typeof employmentRecordId!=='string'||!employmentRecordId)return res.status(400).json({ok:false,error:'EMPLOYMENT_RECORD_ID_REQUIRED'});
  const connectionString=options.databaseUrl||process.env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try {
    let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
    const employments=await sql`SELECT participant_id,state,ended_at FROM employee_employment WHERE employment_record_id=${employmentRecordId} LIMIT 2`;
    if(employments.length!==1)return res.status(404).json({ok:false,error:'EMPLOYMENT_RECORD_NOT_FOUND'});
    if(String(employments[0].state)==='ACTIVE'||!employments[0].ended_at)return res.status(409).json({ok:false,error:'EMPLOYMENT_STILL_ACTIVE'});
    const entitlements=await sql`SELECT entitlement_id,membership_id FROM employee_membership_entitlement WHERE employment_record_id=${employmentRecordId} AND state='GRANTED' LIMIT 2`;
    if(entitlements.length===0)return res.status(200).json({ok:true,changed:false});
    if(entitlements.length!==1)return res.status(503).json({ok:false,error:'EMPLOYEE_MEMBERSHIP_ENTITLEMENT_AMBIGUOUS'});
    const entitlement=entitlements[0];const nowIso=new Date(options.now??Date.now()).toISOString();
    await sql`UPDATE employee_membership_entitlement SET state='ENDED',ended_at=${nowIso},ended_reason='EMPLOYMENT_ENDED',updated_at=${nowIso} WHERE entitlement_id=${String(entitlement.entitlement_id)} AND state='GRANTED'`;
    // Preserve membership as an independent state machine. Sponsorship loss means
    // ordinary annual-fee rules apply; it is not automatic membership termination.
    await sql`UPDATE application_membership SET standing='INITIAL_FEE_DUE' WHERE membership_id=${String(entitlement.membership_id)} AND state='ACTIVE' AND member_type='EMPLOYEE_SPONSORED'`;
    return res.status(200).json({ok:true,changed:true,membershipId:String(entitlement.membership_id),membershipStanding:'INITIAL_FEE_DUE'});
  } catch(error){console.error('Employee membership end reconciliation failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'EMPLOYEE_MEMBERSHIP_END_FAILED'});}
}
