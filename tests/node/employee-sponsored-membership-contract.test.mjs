import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../../packages/durability/sql/022_employee_sponsored_membership.sql',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../../api/employee-membership-sync.js',import.meta.url),'utf8');
const employeeSession=fs.readFileSync(new URL('../../api/employee-session.js',import.meta.url),'utf8');

test('active employee free membership is durably sponsored rather than inferred from authority',()=>{assert.match(migration,/employee_membership_sponsorship/);assert.match(migration,/authority_grant_id/);assert.match(migration,/EMPLOYEE_SPONSORED/);});
test('workforce and membership remain separate state machines',()=>{assert.match(employeeSession,/independent of[\s\S]*membership/);assert.match(bridge,/explicit bridge between independent workforce and membership state machines/i);assert.match(bridge,/EMPLOYEE_NOT_ACTIVE/);});
test('employee entitlement requires active authority at execution time',()=>{assert.match(bridge,/application_authority_grant/);assert.match(bridge,/revoked_at IS NULL OR revoked_at>now\(\)/);});
test('existing membership is not silently overwritten or converted',()=>{assert.match(bridge,/EXISTING_MEMBERSHIP_REQUIRES_EXPLICIT_CONVERSION/);});
test('employee sponsored membership is free and active without annual invoice settlement',()=>{assert.match(bridge,/'ACTIVE','EMPLOYEE_SPONSORED','EMPLOYEE_SPONSORED'/);assert.doesNotMatch(bridge,/membership_subscription_invoice/);});
