import { requireApplicationAuth } from '../lib/application-auth.js';
import { durableId } from '../lib/durable-runtime-semantics.js';

const PREVIEW_PARTICIPANT_ID='preview:member:001';
const REQUEST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_RE=/^[A-Za-z0-9][A-Za-z0-9 _.:/-]{0,119}$/;
function canonicalJson(value){if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;return JSON.stringify(value);}
function sameCommand(row,subject,preference){return String(row.subject)===subject&&canonicalJson(row.preference_json??{})===canonicalJson(preference);}
function serialize(row,idempotent=false){return{surveyResponseId:String(row.survey_response_id),participantId:String(row.participant_id),subject:String(row.subject),preference:row.preference_json??{},economicClassification:String(row.economic_classification),submittedAt:String(row.submitted_at),idempotent};}

export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'SURVEY_WRITE_DISABLED_IN_PRODUCTION'});
 const principal=await requireApplicationAuth(req,res,'member:engagement.survey',PREVIEW_PARTICIPANT_ID);if(!principal)return;
 const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';
 const subject=typeof req.body?.subject==='string'?req.body.subject.trim():'';
 const preference=req.body?.preference&&typeof req.body.preference==='object'&&!Array.isArray(req.body.preference)?req.body.preference:{};
 if(!REQUEST_ID_RE.test(requestId))return res.status(400).json({ok:false,error:'REQUEST_ID_INVALID'});
 if(!SUBJECT_RE.test(subject))return res.status(400).json({ok:false,error:'SUBJECT_INVALID'});
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{
  const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  const prior=await sql`SELECT * FROM member_product_request_survey WHERE participant_id=${principal.actorId} AND idempotency_key=${requestId} LIMIT 1`;
  if(prior[0]){if(!sameCommand(prior[0],subject,preference))return res.status(409).json({ok:false,error:'SURVEY_REQUEST_REBOUND'});return res.status(200).json({ok:true,survey:serialize(prior[0],true)});}
  const surveyResponseId=durableId('survey');
  const rows=await sql`INSERT INTO member_product_request_survey(survey_response_id,participant_id,subject,preference_json,economic_classification,idempotency_key) VALUES(${surveyResponseId},${principal.actorId},${subject},${JSON.stringify(preference)}::jsonb,'NON_COMMITMENT',${requestId}) RETURNING *`;
  res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,survey:serialize(rows[0],false)});
 }catch(error){
  if(error?.code==='23505'){try{const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString);const prior=await sql`SELECT * FROM member_product_request_survey WHERE participant_id=${principal.actorId} AND idempotency_key=${requestId} LIMIT 1`;if(prior[0]){if(!sameCommand(prior[0],subject,preference))return res.status(409).json({ok:false,error:'SURVEY_REQUEST_REBOUND'});return res.status(200).json({ok:true,survey:serialize(prior[0],true)});}}catch{}}
  console.error('Product request survey failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'SURVEY_WRITE_FAILED'});
 }
}
