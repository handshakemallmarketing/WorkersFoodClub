import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='docs/sw1/SW1-RC2-operator-incident-recovery-runbooks.md';
const text=fs.readFileSync(path,'utf8');

const requiredSections=[
 'Ambiguous payment outcome',
 'Duplicate or replayed provider callback',
 'Refund timeout, retry or redelivery',
 'Stuck authorized operation',
 'Database outage and restore',
 'Compromised or rotated secret',
 'Suspected unauthorized access or authority bypass',
 'Projection corruption, mutation or staleness',
 'Inventory or fulfillment discrepancy'
];

test('RC2 operator runbooks cover every mandatory incident class',()=>{
 for(const heading of requiredSections) assert.match(text,new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('RC2 runbooks preserve additive canonical history and prohibit destructive repair',()=>{
 assert.match(text,/recovery is additive/i);
 assert.match(text,/must never edit, delete, rewrite, reorder, backdate or directly mutate canonical events/i);
 assert.match(text,/never restore over the active production database/i);
 assert.match(text,/never blindly re-charge/i);
 assert.match(text,/never issue a second refund solely because the first request timed out/i);
 assert.match(text,/never edit canonical history to match a projection/i);
 assert.match(text,/direct canonical balance adjustment is prohibited/i);
});

test('RC2 runbooks preserve exact-target recovery semantics and fail closed on ambiguity',()=>{
 assert.match(text,/retain the original obligation, participant, offer, amount, currency and prior-operation identity/i);
 assert.match(text,/Redirecting a failed operation to another subject is prohibited/i);
 assert.match(text,/Ambiguous external economic outcomes stay ambiguous until reconciled/i);
 assert.match(text,/provider authenticity cannot be established/i);
 assert.match(text,/title\/risk policy needed to decide a remedy is missing or ambiguous/i);
});

test('RC2 runbooks keep secrets and sensitive evidence out of operational logs',()=>{
 assert.match(text,/Never paste secrets, raw credentials or sensitive verification documents into tickets or operational logs/i);
 assert.match(text,/Do not place the old or new secret in tickets, chat, commits or logs/i);
});
