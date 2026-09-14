function fail(status,error){return Object.freeze({ok:false,status,error});}

export async function resolveApplicationPrincipal(identity, requiredScope, options={}){
  if(!identity || typeof identity.issuer!=='string' || !identity.issuer || typeof identity.subject!=='string' || !identity.subject){
    return fail(403,'APPLICATION_IDENTITY_INVALID');
  }
  const connectionString=options.databaseUrl || process.env.DATABASE_URL;
  if(!connectionString && !options.sql)return fail(503,'APPLICATION_BINDING_STORE_NOT_CONFIGURED');
  try{
    let sql=options.sql;
    if(!sql){
      const {neon}=await import('@neondatabase/serverless');
      sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(3000)}});
    }

    const bindings=await sql`
      SELECT binding_id,participant_id,scopes,state
        FROM application_identity_binding
       WHERE issuer=${identity.issuer} AND subject=${identity.subject}
       LIMIT 2`;
    if(bindings.length!==1)return fail(403,'APPLICATION_IDENTITY_NOT_BOUND');
    const binding=bindings[0];
    if(String(binding.state)!=='ACTIVE')return fail(403,'APPLICATION_PRINCIPAL_DISABLED');
    const scopes=Array.isArray(binding.scopes)?binding.scopes.map(String):[];
    if(!scopes.includes(requiredScope))return fail(403,'AUTHORIZATION_SCOPE_REQUIRED');

    const participantId=String(binding.participant_id);
    const participants=await sql`
      SELECT participant_id,state
        FROM application_participant
       WHERE participant_id=${participantId}
       LIMIT 2`;
    if(participants.length!==1)return fail(403,'APPLICATION_PARTICIPANT_NOT_FOUND');
    if(String(participants[0].state)!=='ACTIVE')return fail(403,'APPLICATION_PARTICIPANT_DISABLED');

    let membershipId;
    let authorityGrantId;
    if(requiredScope.startsWith('member:')){
      const memberships=await sql`
        SELECT membership_id
          FROM application_membership
         WHERE participant_id=${participantId} AND state='ACTIVE'
         LIMIT 2`;
      if(memberships.length!==1)return fail(403,'ACTIVE_MEMBERSHIP_REQUIRED');
      membershipId=String(memberships[0].membership_id);
    }else if(requiredScope.startsWith('operator:')){
      const grants=await sql`
        SELECT grant_id
          FROM application_authority_grant
         WHERE actor_id=${participantId}
           AND ${requiredScope}=ANY(actions)
           AND target_prefix IS NULL
           AND parent_grant_id IS NULL
           AND valid_from<=now()
           AND (valid_until IS NULL OR valid_until>=now())
           AND (revoked_at IS NULL OR revoked_at>now())
         ORDER BY valid_from DESC,grant_id ASC
         LIMIT 1`;
      if(grants.length!==1)return fail(403,'OPERATOR_AUTHORITY_REQUIRED');
      authorityGrantId=String(grants[0].grant_id);
    }

    return Object.freeze({ok:true,principal:Object.freeze({
      subject:identity.subject,
      issuer:identity.issuer,
      actorId:participantId,
      scopes:Object.freeze(scopes),
      bindingId:String(binding.binding_id),
      membershipId,
      authorityGrantId,
      expiresAt:identity.expiresAt,
    })});
  }catch{
    return fail(503,'APPLICATION_BINDING_LOOKUP_FAILED');
  }
}
