import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

/** Authoritative entry resolver. Household invitation activation is token-bound at /activate. */
export default async function handler(req,res,options={}){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const access=requireProductionApplicationAccess(options.env||process.env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
  const verified=await verifyProductionOidcRequest(req,undefined,undefined,options.production||{});if(!verified.ok)return res.status(verified.status).json({ok:false,error:verified.error});
  const connectionString=options.databaseUrl||process.env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try{
    let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(4000)}});}
    const bindings=await sql`SELECT participant_id,state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
    // Policy AUTH-MEMBERSHIP-001: successful OIDC authentication proves identity only.
    // Member admission requires exactly one ACTIVE pre-existing identity binding and
    // an ACTIVE/CURRENT membership. Never synthesize/bind a membership during sign-in.
    if(bindings.length!==1||String(bindings[0].state)!=='ACTIVE'){
      const applications=await sql`SELECT application_id,state,submitted_at FROM membership_application WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} ORDER BY submitted_at DESC LIMIT 1`;
      const application=applications.length===1?applications[0]:null;
      const pending=application!=null&&String(application.state)==='SUBMITTED';
      res.setHeader('Cache-Control','no-store');
      return res.status(403).json({ok:false,error:'MEMBERSHIP_REQUIRED',accessState:pending?'APPLICANT_PENDING':'AUTHENTICATED_UNBOUND',route:pending?'APPLICATION_STATUS':'NON_MEMBER',memberAccessAvailable:false,membershipState:null,standing:null,applicationState:application?.state==null?null:String(application.state),applicationId:application?.application_id==null?null:String(application.application_id),applicationSubmittedAt:application?.submitted_at??null,hasPendingApplication:pending});
    }
    let participantId=null,membership=null,invoice=null;
    if(bindings.length===1&&String(bindings[0].state)==='ACTIVE'){
      participantId=String(bindings[0].participant_id);
      const memberships=await sql`SELECT membership_id,state,standing,member_type,public_member_id FROM application_membership WHERE participant_id=${participantId} ORDER BY established_at DESC LIMIT 1`;
      if(memberships.length===1){membership=memberships[0];if(String(membership.state)!=='ACTIVE'||String(membership.standing)!=='CURRENT'){const invoices=await sql`SELECT invoice_id,state,due_at FROM membership_subscription_invoice WHERE membership_id=${String(membership.membership_id)} AND state='OPEN' ORDER BY created_at DESC LIMIT 1`;if(invoices.length===1)invoice=invoices[0];}}
    }
    const applications=await sql`SELECT application_id,state,submitted_at FROM membership_application WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} ORDER BY submitted_at DESC LIMIT 1`;
    const application=applications.length===1?applications[0]:null;
    const membershipState=membership?String(membership.state):null,standing=membership?.standing==null?null:String(membership.standing),memberType=membership?.member_type==null?null:String(membership.member_type);
    let accessState='AUTHENTICATED_UNBOUND',memberAccessAvailable=false,route='NON_MEMBER';
    if(membershipState==='ACTIVE'&&standing==='CURRENT'){accessState='ACTIVE_CURRENT';memberAccessAvailable=true;route='MEMBER';}
    else if(memberType==='PRIMARY'&&membershipState==='INACTIVE'&&standing==='INITIAL_FEE_DUE'){accessState='INACTIVE_INITIAL_FEE_DUE';route='SUBSCRIPTION_DUE';}
    else if(membershipState==='SUSPENDED'||standing==='PAST_DUE'){accessState='SUSPENDED_PAST_DUE';route='SUBSCRIPTION_DUE';}
    else if(application&&String(application.state)==='SUBMITTED'){accessState='APPLICANT_PENDING';route='APPLICATION_STATUS';}
    else if(membershipState){accessState=`MEMBERSHIP_${membershipState}${standing?`_${standing}`:''}`;route='RESTRICTED';}
    res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,accessState,route,memberAccessAvailable,membershipState,standing,membershipRole:memberType==='HOUSEHOLD_BENEFICIARY'?'HOUSEHOLD':'PRIMARY',memberType,publicMemberId:membership?.public_member_id==null?null:String(membership.public_member_id),applicationState:application?.state==null?null:String(application.state),applicationId:application?.application_id==null?null:String(application.application_id),applicationSubmittedAt:application?.submitted_at??null,hasPendingApplication:application!=null&&String(application.state)==='SUBMITTED',invoice:invoice?{invoiceId:String(invoice.invoice_id),state:String(invoice.state),dueAt:invoice.due_at??null}:null});
  }catch(error){console.error('Membership status read failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBERSHIP_STATUS_FAILED'});}
}
