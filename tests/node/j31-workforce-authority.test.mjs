import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WORKFORCE_DOMAINS,WORKFORCE_CAPABILITIES} from '../../lib/workforce-domains.js';

const binding=fs.readFileSync(new URL('../../lib/application-principal-binding.js',import.meta.url),'utf8');
const tasks=fs.readFileSync(new URL('../../api/workforce-tasks.js',import.meta.url),'utf8');
const domainsApi=fs.readFileSync(new URL('../../api/workforce-domains.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../../public/governed-fetch-extension.js',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const promotionsUi=fs.readFileSync(new URL('../../public/promotions.html',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../../packages/durability/sql/024_workforce_authority_tasks_v1.sql',import.meta.url),'utf8');

test('J31 has exactly seven canonical workforce domains',()=>assert.deepEqual(Object.keys(WORKFORCE_DOMAINS),['FINANCE','LOGISTICS','OPERATIONS','PROCUREMENT_INVENTORY','ENGAGEMENT','MEMBERSHIP_SUPPORT','ADMIN_RISK_COMPLIANCE']));
test('merged domain labels match owner taxonomy',()=>{assert.equal(WORKFORCE_DOMAINS.ENGAGEMENT.label,'Engagement: Surveys & Promotions');assert.equal(WORKFORCE_DOMAINS.MEMBERSHIP_SUPPORT.label,'Membership & Customer Support');assert.equal(WORKFORCE_DOMAINS.PROCUREMENT_INVENTORY.label,'Procurement & Inventory');assert.equal(WORKFORCE_DOMAINS.ADMIN_RISK_COMPLIANCE.label,'Administration, Risk & Compliance');assert.ok(WORKFORCE_DOMAINS.FINANCE.functions.cagd);});
test('promotions is an Engagement capability',()=>assert.equal(WORKFORCE_CAPABILITIES['operator:promotions.manage'].domain,'ENGAGEMENT'));
test('tasks never grant authority and reject missing assignee capability',()=>{assert.match(tasks,/ASSIGNEE_AUTHORITY_MISSING/);assert.match(tasks,/TEAM_MEMBER_AUTHORITY_MISSING/);assert.match(schema,/Assignment is responsibility, never authority/);});
test('workforce capability taxonomy is not anonymously enumerable',()=>{assert.match(domainsApi,/requireApplicationAuth/);assert.match(domainsApi,/workforce:assign\.manage/);});
test('System Owner is root workforce authority without enumerated capability rows',()=>{assert.match(binding,/authority:owner/);assert.match(binding,/OR \$\{OWNER_ACTION\}=ANY\(actions\)/);assert.match(binding,/isSystemOwner/);});

test('governed browser routes are wired through the credential bridge',()=>{assert.match(shell,/governed-fetch-extension\.js/);for(const path of ['/api/workforce-domains','/api/fulfillment-plan-schedule','/api/promotion-compliance'])assert.match(bridge,new RegExp(path.replaceAll('/','\\/')));});
test('Promotions UI probes granular promotions authority instead of SuperUser proxy',()=>{assert.match(promotionsUi,/fetch\('\/api\/promotions'/);assert.match(promotionsUi,/promotionsAuthority/);assert.doesNotMatch(promotionsUi,/superUserAccessAvailable/);});
