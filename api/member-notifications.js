const PARTICIPANT_ID='preview:member:001';

export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'PREVIEW_MEMBER_INBOX_DISABLED_IN_PRODUCTION'});
  const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try{
    const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(4000)}});
    const rows=await sql`
      SELECT id,event_id,subject_id,event_type,rendered_subject,rendered_body,status,queued_at,sent_at,delivered_at
        FROM communication_outbox
       WHERE member_id=${PARTICIPANT_ID}
         AND channel='IN_APP'
       ORDER BY queued_at DESC
       LIMIT 50
    `;
    const notifications=rows.map(r=>({id:String(r.id),eventId:String(r.event_id),subjectId:String(r.subject_id),eventType:String(r.event_type),subject:String(r.rendered_subject),body:String(r.rendered_body),status:String(r.status),queuedAt:String(r.queued_at),sentAt:r.sent_at?String(r.sent_at):null,deliveredAt:r.delivered_at?String(r.delivered_at):null}));
    res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,source:'neon-server',memberId:PARTICIPANT_ID,notifications});
  }catch(error){console.error('Member notification query failed',{name:error?.name,message:error?.message});return res.status(503).json({ok:false,error:'MEMBER_NOTIFICATIONS_FETCH_FAILED'});}
}
