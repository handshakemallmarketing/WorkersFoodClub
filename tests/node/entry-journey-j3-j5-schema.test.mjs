import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../packages/durability/sql/018_entry_journey_activation.sql', import.meta.url), 'utf8');
const decide = readFileSync(new URL('../../api/membership-application-decide.js', import.meta.url), 'utf8');

test('J4 approval is activation and does not define a pending activation state', () => {
  assert.match(sql, /APPROVE decision is the activation event/);
  assert.doesNotMatch(sql, /APPROVED_PENDING_ACTIVATION/);
  assert.doesNotMatch(sql, /ADD COLUMN IF NOT EXISTS activation_state/);
  assert.match(decide, /'ACTIVE'/);
});

test('J4 public member ID is separate and unique', () => {
  assert.match(sql, /public_member_id text/);
  assert.match(sql, /application_membership_public_member_id_uq/);
});

test('J5 access audit is durable and timestamped', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS application_access_audit/);
  assert.match(sql, /event_type text NOT NULL/);
  assert.match(sql, /outcome text NOT NULL/);
  assert.match(sql, /occurred_at timestamptz NOT NULL DEFAULT now\(\)/);
});

test('audit schema avoids collecting raw IP address by default', () => {
  assert.doesNotMatch(sql, /ip_address/i);
});
