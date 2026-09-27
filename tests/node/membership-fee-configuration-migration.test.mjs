import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../../packages/durability/sql/035_membership_fee_configuration.sql', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../../api/membership-fee-settings.js', import.meta.url), 'utf8');

test('membership fee configuration is versioned, never destructively updated', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS membership_fee_configuration/);
  assert.match(schema, /membership_fee_configuration_one_active_uq/);
  assert.doesNotMatch(schema, /DELETE FROM membership_fee_configuration/);
  assert.match(schema, /UPDATE membership_fee_configuration SET active=false/);
});

test('setting a new fee is serialized with an advisory lock, not a bare read-then-write', () => {
  assert.match(schema, /pg_advisory_xact_lock/);
});

test('only the System Owner may change the membership fee', () => {
  assert.match(settings, /principal\.isSystemOwner/);
  assert.match(settings, /MEMBERSHIP_FEE_OWNER_AUTHORITY_REQUIRED/);
});
