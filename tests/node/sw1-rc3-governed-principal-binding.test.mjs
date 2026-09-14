import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveApplicationPrincipal} from '../../lib/application-principal-binding.js';

const identity={issuer:'https://accounts.google.com',subject:'subject-1',expiresAt:9999999999};

function fakeSql({binding,participant,memberships=[],grants=[]}){
  return async (strings,...values)=>{
    const text=strings.join('?');
    if(text.includes('FROM application_identity_binding')) return binding?[binding]:[];
    if(text.includes('FROM application_participant')) return participant?[participant]:[];
    if(text.includes('FROM application_membership')) return memberships;
    if(text.includes('FROM application_authority_grant')){
      const requiredScope=values[1];
      return grants.filter((g)=>Array.isArray(g.actions)&&g.actions.includes(requiredScope)&&g.target_prefix==null&&g.parent_grant_id==null&&!g.revoked).slice(0,1);
    }
    throw new Error('UNEXPECTED_QUERY');
  };
}

const binding=(scopes)=>({binding_id:'binding:1',participant_id:'participant:1',scopes,state:'ACTIVE'});
const participant={participant_id:'participant:1',state:'ACTIVE'};

test('RC3 governed member principal requires ACTIVE membership',async()=>{
  const denied=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding(['member:orders.read']),participant,memberships:[]})});
  assert.deepEqual(denied,{ok:false,status:403,error:'ACTIVE_MEMBERSHIP_REQUIRED'});

  const allowed=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding(['member:orders.read']),participant,memberships:[{membership_id:'membership:1'}]})});
  assert.equal(allowed.ok,true);
  assert.equal(allowed.principal.actorId,'participant:1');
  assert.equal(allowed.principal.membershipId,'membership:1');
  assert.equal(allowed.principal.authorityGrantId,undefined);
});

test('RC3 governed operator principal requires active route-wide root authority',async()=>{
  const denied=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql({binding:binding(['operator:orders.read']),participant,grants:[]})});
  assert.deepEqual(denied,{ok:false,status:403,error:'OPERATOR_AUTHORITY_REQUIRED'});

  const allowed=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql({binding:binding(['operator:orders.read']),participant,grants:[{grant_id:'grant:operator:1',actions:['operator:orders.read'],target_prefix:null,parent_grant_id:null}]})});
  assert.equal(allowed.ok,true);
  assert.equal(allowed.principal.actorId,'participant:1');
  assert.equal(allowed.principal.authorityGrantId,'grant:operator:1');
  assert.equal(allowed.principal.membershipId,undefined);
});

test('RC3 governed principal requires an ACTIVE durable participant',async()=>{
  const missing=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding(['member:orders.read']),participant:null,memberships:[{membership_id:'membership:1'}]})});
  assert.deepEqual(missing,{ok:false,status:403,error:'APPLICATION_PARTICIPANT_NOT_FOUND'});

  const disabled=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding(['member:orders.read']),participant:{participant_id:'participant:1',state:'DISABLED'},memberships:[{membership_id:'membership:1'}]})});
  assert.deepEqual(disabled,{ok:false,status:403,error:'APPLICATION_PARTICIPANT_DISABLED'});
});

test('RC3 binding scopes remain necessary but are no longer sufficient',async()=>{
  const denied=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding([]),participant,memberships:[{membership_id:'membership:1'}]})});
  assert.deepEqual(denied,{ok:false,status:403,error:'AUTHORIZATION_SCOPE_REQUIRED'});
});
