import { requireApplicationAuth } from '../lib/application-auth.js';
import { durableId } from '../lib/durable-runtime-semantics.js';
const REQUEST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE=/^[A-Za-z0-9][A-Za-z0-9 _.:/-]{0,119}$/;
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;
function validEvidenceRefs(value){return Array.isArray(value)&&value.length<=32&&value.every(v=>typeof v==='string'&&REF.test(v));}
function canonicalJson(value){if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;return JSON.stringify(value);}
function sameCommand(row,c){return (row.participant_id??null)===(c.participantId??null)&&String(row.subject_type)===c.subjectType&&String(row.subject_id)===c.subjectId&&String(row.category)===c.category&&String(row.reason_code)===c.reasonCode&&String(row.created_by_authority_ref)===c.authorityRef&&canonicalJson(row.evidence_refs??[])===canonicalJson(c.evidenceRefs);}
function creationOut(r,idempotent=false){return{caseId:String(r.case_id),participantId:r.participant_id?String(r.participant_id):null,subjectType:String(r.subject_type),subjectId:String(r.subject_id),category:String(r.category),reasonCode:String(r.reason_code),state:'OPEN',stateVersion:1,evidenceRefs:r.evidence_refs??[],updatedAt:String(r.opened_at),idempotent};}
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'SUPPORT_CASE_WRITE_DISABLED_IN_PRODUCTION'});
 const actorId=typeof req.body?.actorId==='string'?req.body.actorId:'';const principal=await requireApplicationAuth(req,res,'operator:support.manage',actorId);if(!principal)return;
 const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';if(!REQUEST_ID_RE.test(requestId))return res.status(400).json({ok:false,error:'REQUEST_ID_INVALID'});
 const subjectType=String(req.body?.subjectType??''),subjectId=String(req.body?.subjectId??''),category=String(req.body?.category??''),reasonCode=String(req.body?.reasonCode??'');
 if(![subjectType,subjectId,category,reasonCode].every(v=>SAFE.test(v)))return res.status(400).json({ok:false,error:'CASE_FIELDS_INVALID'});
 const participantRaw=req.body?.participantId;const participantId=participantRaw==null?null:participantRaw;if(participantId!==null&&(typeof participantId!=='string'||!SAFE.test(participantId)))return res.status(400).json({ok:false,error:'PARTICIPANT_ID_INVALID'});
 const evidenceRefs=req.body?.evidenceRefs??[];if(!validEvidenceRefs(evidenceRefs))return res.status(400).json({ok:false,error:'EVIDENCE_REFS_INVALID'});
 const authorityRef=`preview-auth:${principal.subject}`;const command={participantId,subjectType,subjectId,category,reasonCode,authorityRef,evidenceRefs};
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 let sql;
 try{const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});const prior=await sql`SELECT * FROM support_case WHERE created_by_actor_id=${principal.actorId} AND command_idempotency_key=${requestId} LIMIT 1`;
  if(prior[0]){if(!sameCommand(prior[0],command))return res.status(409).json({ok:false,error:'SUPPORT_CASE_REQUEST_REBOUND'});return res.status(200).json({ok:true,case:creationOut(prior[0],true)});}
  const caseId=durableId('case');const rows=await sql`INSERT INTO support_case(case_id,participant_id,subject_type,subject_id,category,reason_code,state,state_version,evidence_refs,created_by_actor_id,created_by_authority_ref,updated_by_actor_id,updated_by_authority_ref,command_idempotency_key) VALUES(${caseId},${command.participantId},${subjectType},${subjectId},${category},${reasonCode},'OPEN',1,${JSON.stringify(command.evidenceRefs)}::jsonb,${principal.actorId},${authorityRef},${principal.actorId},${authorityRef},${requestId}) RETURNING *`;
  return res.status(201).json({ok:true,case:creationOut(rows[0],false)});
 }catch(error){if(error?.code==='23505'&&sql){const prior=await sql`SELECT * FROM support_case WHERE created_by_actor_id=${principal.actorId} AND command_idempotency_key=${requestId} LIMIT 1`;if(prior[0]){if(!sameCommand(prior[0],command))return res.status(409).json({ok:false,error:'SUPPORT_CASE_REQUEST_REBOUND'});return res.status(200).json({ok:true,case:creationOut(prior[0],true)});}return res.status(409).json({ok:false,error:'SUPPORT_CASE_COMMAND_CONFLICT'});}console.error('Support case command failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'SUPPORT_CASE_WRITE_FAILED'});}
}
