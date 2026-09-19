import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveApplicationPrincipal} from '../../lib/application-principal-binding.js';
import {signEmployeeSessionToken} from '../../lib/employee-session.js';

const identity={issuer:'https://accounts.google.com',subject:'subject-1',expiresAt:9999999999};
const EMPLOYEE_SESSION_SECRET='rc3-governed-binding-test-secret-0123456789-abcdef';

function fakeSql({binding,participant,memberships=[],grants=[],employeeSessions=[]}){
  return async (strings,...values)=>{
    const text=strings.join('?');
    if(text.includes('FROM application_identity_binding')) return binding?[binding]:[];
    if(text.includes('FROM application_participant')) return participant?[participant]:[];
    if(text.includes('FROM application_membership')) return text.includes("standing='CURRENT'") ? memberships.filter(m=>String(m.state||'ACTIVE')==='ACTIVE'&&String(m.standing||'CURRENT')==='CURRENT') : memberships;
    if(text.includes('FROM employee_session')){
      const [sessionId,participantId]=values;
      return employeeSessions.filter((s)=>s.session_id===sessionId&&s.participant_id===participantId&&!s.expired&&!s.revoked).slice(0,1);
    }
    if(text.includes('FROM application_authority_grant')){
      const requiredScope=values[1];
      return grants.filter((g)=>
        Array.isArray(g.actions)&&g.actions.includes(requiredScope)
        &&g.target_prefix==null
        &&!g.revoked
        &&!g.expired
        &&!g.notYetValid
      ).slice(0,1);
    }
    throw new Error('UNEXPECTED_QUERY');
  };
}

const binding=(scopes)=>({binding_id:'binding:1',participant_id:'participant:1',scopes,state:'ACTIVE'});
const participant={participant_id:'participant:1',state:'ACTIVE'};

function withValidEmployeeSession(fixture){
  const sessionId='session:1';
  return {
    ...fixture,
    employeeSessions:[{session_id:sessionId,participant_id:'participant:1'}],
    employeeSessionSecret:EMPLOYEE_SESSION_SECRET,
    employeeSessionToken:signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET,sessionId),
  };
}

test('RC3 governed member principal requires ACTIVE CURRENT membership',async()=>{
  const denied=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding(['member:orders.read']),participant,memberships:[]})});
  assert.deepEqual(denied,{ok:false,status:403,error:'ACTIVE_CURRENT_MEMBERSHIP_REQUIRED'});

  const allowed=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding(['member:orders.read']),participant,memberships:[{membership_id:'membership:1',state:'ACTIVE',standing:'CURRENT'}]})});
  assert.equal(allowed.ok,true);
  assert.equal(allowed.principal.actorId,'participant:1');
  assert.equal(allowed.principal.membershipId,'membership:1');
  assert.equal(allowed.principal.authorityGrantId,undefined);
});

test('AUTH-MEMBERSHIP-001 member APIs reject non-CURRENT standing even when binding retains member scope',async()=>{
  const denied=await resolveApplicationPrincipal(identity,'member:orders.read',{sql:fakeSql({binding:binding(['member:orders.read']),participant,memberships:[{membership_id:'membership:1',state:'ACTIVE',standing:'PAST_DUE'}]})});
  assert.deepEqual(denied,{ok:false,status:403,error:'ACTIVE_CURRENT_MEMBERSHIP_REQUIRED'});
});

test('RC3 governed operator principal requires active route-wide root authority',async()=>{
  // No matching grant is rejected before the employee-session check is even reached.
  const denied=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql({binding:binding(['operator:orders.read']),participant,grants:[]})});
  assert.deepEqual(denied,{ok:false,status:403,error:'OPERATOR_AUTHORITY_REQUIRED'});

  const fixture=withValidEmployeeSession({binding:binding(['operator:orders.read']),participant,grants:[{grant_id:'grant:operator:1',actions:['operator:orders.read'],target_prefix:null}]});
  const allowed=await resolveApplicationPrincipal(identity,'operator:orders.read',{
    sql:fakeSql(fixture),
    employeeSessionSecret:fixture.employeeSessionSecret,
    employeeSessionToken:fixture.employeeSessionToken,
  });
  assert.equal(allowed.ok,true);
  assert.equal(allowed.principal.actorId,'participant:1');
  assert.equal(allowed.principal.authorityGrantId,'grant:operator:1');
  assert.equal(allowed.principal.employeeSessionId,'session:1');
  assert.equal(allowed.principal.membershipId,undefined);
});

test('RC3 an active operator grant delegated via parent_grant_id (Admin-issued) is still recognized', async () => {
  const fixture=withValidEmployeeSession({binding:binding(['operator:orders.read']),participant,grants:[{grant_id:'grant:operator:delegated',actions:['operator:orders.read'],target_prefix:null,parent_grant_id:'grant:admin:1'}]});
  const allowed=await resolveApplicationPrincipal(identity,'operator:orders.read',{
    sql:fakeSql(fixture),
    employeeSessionSecret:fixture.employeeSessionSecret,
    employeeSessionToken:fixture.employeeSessionToken,
  });
  assert.equal(allowed.ok,true);
  assert.equal(allowed.principal.authorityGrantId,'grant:operator:delegated');
});

test('RC3 an operator-scoped request without a live employee session is denied even with a valid grant', async () => {
  const grantFixture={binding:binding(['operator:orders.read']),participant,grants:[{grant_id:'grant:operator:1',actions:['operator:orders.read'],target_prefix:null}]};

  const notConfigured=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql(grantFixture)});
  assert.deepEqual(notConfigured,{ok:false,status:503,error:'EMPLOYEE_SESSION_NOT_CONFIGURED'});

  const missingToken=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql(grantFixture),employeeSessionSecret:EMPLOYEE_SESSION_SECRET});
  assert.deepEqual(missingToken,{ok:false,status:401,error:'EMPLOYEE_SESSION_REQUIRED'});

  const forgedToken=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql(grantFixture),employeeSessionSecret:EMPLOYEE_SESSION_SECRET,employeeSessionToken:'wfc-employee-v1.session-x.forged-signature'});
  assert.deepEqual(forgedToken,{ok:false,status:401,error:'EMPLOYEE_SESSION_REQUIRED'});

  const unknownSession=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql({...grantFixture,employeeSessions:[]}),employeeSessionSecret:EMPLOYEE_SESSION_SECRET,employeeSessionToken:signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET,'session:never-issued')});
  assert.deepEqual(unknownSession,{ok:false,status:401,error:'EMPLOYEE_SESSION_INVALID'});

  const revokedSession=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql({...grantFixture,employeeSessions:[{session_id:'session:1',participant_id:'participant:1',revoked:true}]}),employeeSessionSecret:EMPLOYEE_SESSION_SECRET,employeeSessionToken:signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET,'session:1')});
  assert.deepEqual(revokedSession,{ok:false,status:401,error:'EMPLOYEE_SESSION_INVALID'});

  const expiredSession=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql({...grantFixture,employeeSessions:[{session_id:'session:1',participant_id:'participant:1',expired:true}]}),employeeSessionSecret:EMPLOYEE_SESSION_SECRET,employeeSessionToken:signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET,'session:1')});
  assert.deepEqual(expiredSession,{ok:false,status:401,error:'EMPLOYEE_SESSION_INVALID'});

  const otherPersonsSession=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql({...grantFixture,employeeSessions:[{session_id:'session:1',participant_id:'participant:someone-else'}]}),employeeSessionSecret:EMPLOYEE_SESSION_SECRET,employeeSessionToken:signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET,'session:1')});
  assert.deepEqual(otherPersonsSession,{ok:false,status:401,error:'EMPLOYEE_SESSION_INVALID'});
});

test('RC3 a revoked, expired, not-yet-valid, or target-scoped grant does not satisfy general operator authority',async()=>{
  const base=(overrides)=>({binding:binding(['operator:orders.read']),participant,grants:[{grant_id:'grant:x',actions:['operator:orders.read'],target_prefix:null,...overrides}]});

  const revoked=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql(base({revoked:true}))});
  assert.deepEqual(revoked,{ok:false,status:403,error:'OPERATOR_AUTHORITY_REQUIRED'});

  const expired=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql(base({expired:true}))});
  assert.deepEqual(expired,{ok:false,status:403,error:'OPERATOR_AUTHORITY_REQUIRED'});

  const notYetValid=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql(base({notYetValid:true}))});
  assert.deepEqual(notYetValid,{ok:false,status:403,error:'OPERATOR_AUTHORITY_REQUIRED'});

  // A grant scoped to a target prefix (e.g. a policy-ratification-only grant) must not
  // be usable as general operator authority for an unrelated scope family.
  const targetScoped=await resolveApplicationPrincipal(identity,'operator:orders.read',{sql:fakeSql(base({target_prefix:'GH-PILOT-TITLE-RISK'}))});
  assert.deepEqual(targetScoped,{ok:false,status:403,error:'OPERATOR_AUTHORITY_REQUIRED'});
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

test('RC3 governed principal fails closed for unsupported scope families',async()=>{
  const denied=await resolveApplicationPrincipal(identity,'admin:audit.read',{sql:fakeSql({binding:binding(['admin:audit.read']),participant})});
  assert.deepEqual(denied,{ok:false,status:403,error:'AUTHORIZATION_SCOPE_FAMILY_UNSUPPORTED'});
});
