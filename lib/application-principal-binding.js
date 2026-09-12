function fail(status,error){return Object.freeze({ok:false,status,error});}

export async function resolveApplicationPrincipal(identity, requiredScope, options={}){
  if(!identity || typeof identity.issuer!=='string' || !identity.issuer || typeof identity.subject!=='string' || !identity.subject){
    return fail(403,'APPLICATION_IDENTITY_INVALID');
  }
  const connectionString=options.databaseUrl || process.env.DATABASE_URL;
  if(!connectionString)return fail(503,'APPLICATION_BINDING_STORE_NOT_CONFIGURED');
  try{
    const {neon}=await import('@neondatabase/serverless');
    const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(3000)}});
    const rows=await sql`
      SELECT binding_id,participant_id,scopes,state
        FROM application_identity_binding
       WHERE issuer=${identity.issuer} AND subject=${identity.subject}
       LIMIT 2`;
    if(rows.length!==1)return fail(403,'APPLICATION_IDENTITY_NOT_BOUND');
    const row=rows[0];
    if(String(row.state)!=='ACTIVE')return fail(403,'APPLICATION_PRINCIPAL_DISABLED');
    const scopes=Array.isArray(row.scopes)?row.scopes.map(String):[];
    if(!scopes.includes(requiredScope))return fail(403,'AUTHORIZATION_SCOPE_REQUIRED');
    return Object.freeze({ok:true,principal:Object.freeze({subject:identity.subject,issuer:identity.issuer,actorId:String(row.participant_id),scopes:Object.freeze(scopes),bindingId:String(row.binding_id),expiresAt:identity.expiresAt})});
  }catch{
    return fail(503,'APPLICATION_BINDING_LOOKUP_FAILED');
  }
}
