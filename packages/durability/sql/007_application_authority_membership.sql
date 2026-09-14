CREATE TABLE IF NOT EXISTS application_participant (
  participant_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('PERSON','ORGANIZATION','SYSTEM')),
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_membership (
  membership_id text PRIMARY KEY,
  participant_id text NOT NULL REFERENCES application_participant(participant_id),
  state text NOT NULL CHECK (state IN ('ACTIVE','SUSPENDED','ENDED')),
  established_at timestamptz NOT NULL,
  eligibility_policy_version text NOT NULL,
  eligibility_evidence_ids text[] NOT NULL CHECK (cardinality(eligibility_evidence_ids) > 0),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'ENDED' AND ended_at IS NOT NULL) OR (state <> 'ENDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS application_membership_one_active_per_participant_idx
  ON application_membership(participant_id)
  WHERE state = 'ACTIVE';

CREATE INDEX IF NOT EXISTS application_membership_participant_idx
  ON application_membership(participant_id);

CREATE TABLE IF NOT EXISTS application_authority_grant (
  grant_id text PRIMARY KEY,
  grantor_id text NOT NULL REFERENCES application_participant(participant_id),
  actor_id text NOT NULL REFERENCES application_participant(participant_id),
  actions text[] NOT NULL CHECK (cardinality(actions) > 0),
  target_prefix text,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  revoked_at timestamptz,
  parent_grant_id text REFERENCES application_authority_grant(grant_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CHECK (revoked_at IS NULL OR revoked_at >= valid_from)
);

CREATE INDEX IF NOT EXISTS application_authority_grant_actor_idx
  ON application_authority_grant(actor_id);

CREATE INDEX IF NOT EXISTS application_authority_grant_actions_gin_idx
  ON application_authority_grant USING gin(actions);
