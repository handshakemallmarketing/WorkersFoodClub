-- Verify-before-provision enrollment amendment (BLV2-DEC-031).
-- Contact verification now gates membership/Member Number/invoice creation
-- instead of following it. A PENDING_VERIFICATION application is transient
-- and carries no durable membership artifact.

ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_state_check;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_state_check
  CHECK (state IN ('PENDING_VERIFICATION','SUBMITTED','APPROVED','REJECTED','EXPIRED'));
ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_check;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_check
  CHECK (state IN ('PENDING_VERIFICATION','SUBMITTED','EXPIRED') OR decided_at IS NOT NULL);
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS campaign_id text;

CREATE TABLE IF NOT EXISTS enrollment_campaign (
  campaign_id text PRIMARY KEY,
  campaign_token text NOT NULL,
  institution_label text NOT NULL CHECK (length(trim(institution_label)) > 0),
  opens_at timestamptz,
  closes_at timestamptz,
  max_enrollments integer CHECK (max_enrollments IS NULL OR max_enrollments > 0),
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS enrollment_campaign_token_uq ON enrollment_campaign(campaign_token);

ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_campaign_fk;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_campaign_fk
  FOREIGN KEY (campaign_id) REFERENCES enrollment_campaign(campaign_id);

CREATE TABLE IF NOT EXISTS enrollment_verification_challenge (
  challenge_id text PRIMARY KEY,
  application_id text NOT NULL REFERENCES membership_application(application_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('EMAIL','PHONE')),
  destination_hash text NOT NULL,
  code_hash text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','USED','EXPIRED','REVOKED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CHECK ((state = 'USED') = (used_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS enrollment_verification_challenge_application_idx
  ON enrollment_verification_challenge(application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS enrollment_rate_limit_event (
  event_id text PRIMARY KEY,
  key_type text NOT NULL CHECK (key_type IN ('ENROLLMENT_START_IP','VERIFICATION_SEND_PHONE','VERIFICATION_SEND_EMAIL','VERIFICATION_ATTEMPT_IP')),
  key_value text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enrollment_rate_limit_event_key_idx
  ON enrollment_rate_limit_event(key_type, key_value, occurred_at DESC);

CREATE OR REPLACE FUNCTION record_rate_limit_event(
  p_event_id text, p_key_type text, p_key_value text,
  p_window_seconds integer, p_max_count integer, p_now timestamptz
) RETURNS TABLE(allowed boolean, current_count integer)
LANGUAGE plpgsql AS $$
DECLARE cnt integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key_type||':'||p_key_value, 0));
  SELECT count(*) INTO cnt FROM enrollment_rate_limit_event e
    WHERE e.key_type = p_key_type AND e.key_value = p_key_value
      AND e.occurred_at > p_now - make_interval(secs => p_window_seconds);
  IF cnt >= p_max_count THEN
    allowed := false; current_count := cnt; RETURN NEXT; RETURN;
  END IF;
  INSERT INTO enrollment_rate_limit_event(event_id, key_type, key_value, occurred_at)
    VALUES (p_event_id, p_key_type, p_key_value, p_now);
  allowed := true; current_count := cnt + 1; RETURN NEXT;
END $$;

-- Resolves an enrollment contact to one of: an existing numbered membership
-- (route to the existing member sign-in challenge instead), a resumable
-- unverified pending application, or a brand-new pending application.
-- Never creates a participant/membership/Member Number/invoice.
CREATE OR REPLACE FUNCTION resolve_enrollment_contact(
  p_application_id text, p_full_name text, p_government_employer text,
  p_campaign_id text, p_channel text, p_destination_normalized text, p_now timestamptz
) RETURNS TABLE(route text, application_id text, membership_id text)
LANGUAGE plpgsql AS $$
DECLARE
  existing_app membership_application%ROWTYPE;
  campaign_count integer;
  campaign_max integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('enrollment-contact:'||p_channel||':'||p_destination_normalized, 0));

  SELECT * INTO existing_app FROM membership_application a
    WHERE (CASE WHEN p_channel = 'EMAIL' THEN a.email ELSE a.phone END) = p_destination_normalized
      AND a.state IN ('PENDING_VERIFICATION','SUBMITTED','APPROVED')
    ORDER BY a.submitted_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND AND existing_app.resulting_membership_id IS NOT NULL THEN
    route := 'EXISTING_MEMBER'; application_id := existing_app.application_id;
    membership_id := existing_app.resulting_membership_id; RETURN NEXT; RETURN;
  END IF;

  IF FOUND THEN
    route := 'RESUME_PENDING'; application_id := existing_app.application_id;
    membership_id := NULL; RETURN NEXT; RETURN;
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    PERFORM 1 FROM enrollment_campaign c WHERE c.campaign_id = p_campaign_id AND c.active
      AND (c.opens_at IS NULL OR c.opens_at <= p_now) AND (c.closes_at IS NULL OR c.closes_at > p_now)
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ENROLLMENT_CAMPAIGN_CLOSED' USING ERRCODE = '23514';
    END IF;
    SELECT max_enrollments INTO campaign_max FROM enrollment_campaign WHERE campaign_id = p_campaign_id;
    IF campaign_max IS NOT NULL THEN
      SELECT count(*) INTO campaign_count FROM membership_application a
        WHERE a.campaign_id = p_campaign_id AND a.state IN ('PENDING_VERIFICATION','SUBMITTED','APPROVED');
      IF campaign_count >= campaign_max THEN
        RAISE EXCEPTION 'ENROLLMENT_CAMPAIGN_FULL' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  INSERT INTO membership_application(
    application_id, issuer, subject, full_name, email, phone, government_employer,
    state, review_mode, review_status, submitted_at, campaign_id
  ) VALUES (
    p_application_id, NULL, NULL, p_full_name,
    CASE WHEN p_channel = 'EMAIL' THEN p_destination_normalized ELSE NULL END,
    CASE WHEN p_channel = 'PHONE' THEN p_destination_normalized ELSE NULL END,
    p_government_employer, 'PENDING_VERIFICATION', 'AUTO', 'NOT_REQUIRED', p_now, p_campaign_id
  );
  route := 'NEW'; application_id := p_application_id; membership_id := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION create_enrollment_verification_challenge(
  p_challenge_id text, p_application_id text, p_channel text,
  p_destination_hash text, p_code_hash text, p_expires_at timestamptz
) RETURNS TABLE(challenge_id text)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_application_id, 0));
  IF (SELECT count(*) FROM enrollment_verification_challenge
      WHERE application_id = p_application_id AND created_at > now() - interval '15 minutes') >= 5 THEN
    RETURN;
  END IF;
  UPDATE enrollment_verification_challenge SET state = 'REVOKED'
    WHERE application_id = p_application_id AND state = 'OPEN';
  INSERT INTO enrollment_verification_challenge(
    challenge_id, application_id, channel, destination_hash, code_hash, state, expires_at
  ) VALUES (p_challenge_id, p_application_id, p_channel, p_destination_hash, p_code_hash, 'OPEN', p_expires_at);
  RETURN QUERY SELECT p_challenge_id;
END $$;

-- Verifies an enrollment challenge and, on first successful verification,
-- atomically provisions the participant/membership/Member Number and
-- establishes a member session in the same transaction. Idempotent on replay.
CREATE OR REPLACE FUNCTION verify_and_provision_enrollment(
  p_challenge_id text, p_code_hash text, p_now timestamptz,
  p_participant_id text, p_membership_id text, p_public_member_id text,
  p_session_id text, p_session_expires_at timestamptz
) RETURNS TABLE(
  challenge_state text, challenge_attempts integer, application_id text,
  membership_id text, public_member_id text, session_id text, idempotent boolean
) LANGUAGE plpgsql AS $$
DECLARE
  ch enrollment_verification_challenge%ROWTYPE;
  app membership_application%ROWTYPE;
  changed integer;
BEGIN
  SELECT * INTO ch FROM enrollment_verification_challenge
    WHERE enrollment_verification_challenge.challenge_id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- A retry of an already-successful verification (e.g. the client never saw the first
  -- response) must return the real, original membership -- not fall through to a bare
  -- 'USED' with null fields, which the caller would otherwise misread as success.
  IF ch.state = 'USED' THEN
    challenge_state := 'USED'; challenge_attempts := ch.attempts;
    IF ch.code_hash <> p_code_hash THEN RETURN NEXT; RETURN; END IF;
    SELECT * INTO app FROM membership_application WHERE membership_application.application_id = ch.application_id;
    IF NOT FOUND OR app.resulting_membership_id IS NULL THEN RETURN NEXT; RETURN; END IF;
    SELECT s.session_id INTO session_id FROM member_session s
      WHERE s.membership_id = app.resulting_membership_id AND s.state = 'ACTIVE' AND s.expires_at > p_now
      ORDER BY s.created_at DESC LIMIT 1;
    IF session_id IS NULL THEN
      INSERT INTO member_session(session_id, membership_id, participant_id, state, expires_at)
        SELECT p_session_id, m.membership_id, m.participant_id, 'ACTIVE', p_session_expires_at
        FROM application_membership m WHERE m.membership_id = app.resulting_membership_id
        RETURNING member_session.session_id INTO session_id;
    END IF;
    application_id := app.application_id; membership_id := app.resulting_membership_id;
    SELECT m.public_member_id INTO public_member_id FROM application_membership m
      WHERE m.membership_id = app.resulting_membership_id;
    idempotent := true; RETURN NEXT; RETURN;
  END IF;

  IF ch.state <> 'OPEN' OR ch.expires_at <= p_now OR ch.attempts >= 5 THEN
    challenge_state := ch.state; challenge_attempts := ch.attempts; RETURN NEXT; RETURN;
  END IF;

  IF ch.code_hash <> p_code_hash THEN
    UPDATE enrollment_verification_challenge SET attempts = attempts + 1,
        state = CASE WHEN attempts + 1 >= 5 THEN 'REVOKED' ELSE state END
      WHERE enrollment_verification_challenge.challenge_id = p_challenge_id
      RETURNING attempts, state INTO ch.attempts, ch.state;
    challenge_state := ch.state; challenge_attempts := ch.attempts; RETURN NEXT; RETURN;
  END IF;

  UPDATE enrollment_verification_challenge SET state = 'USED', used_at = p_now
    WHERE enrollment_verification_challenge.challenge_id = p_challenge_id AND state = 'OPEN';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN challenge_state := 'REVOKED'; challenge_attempts := ch.attempts; RETURN NEXT; RETURN; END IF;

  SELECT * INTO app FROM membership_application
    WHERE membership_application.application_id = ch.application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment application missing after challenge consumption'; END IF;

  IF app.resulting_membership_id IS NOT NULL THEN
    SELECT s.session_id INTO session_id FROM member_session s
      WHERE s.membership_id = app.resulting_membership_id AND s.state = 'ACTIVE' AND s.expires_at > p_now
      ORDER BY s.created_at DESC LIMIT 1;
    IF session_id IS NULL THEN
      INSERT INTO member_session(session_id, membership_id, participant_id, state, expires_at)
        SELECT p_session_id, m.membership_id, m.participant_id, 'ACTIVE', p_session_expires_at
        FROM application_membership m WHERE m.membership_id = app.resulting_membership_id
        RETURNING member_session.session_id INTO session_id;
    END IF;
    challenge_state := 'USED'; challenge_attempts := ch.attempts;
    application_id := app.application_id; membership_id := app.resulting_membership_id;
    SELECT m.public_member_id INTO public_member_id FROM application_membership m
      WHERE m.membership_id = app.resulting_membership_id;
    idempotent := true; RETURN NEXT; RETURN;
  END IF;

  IF app.state <> 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'enrollment application in unexpected state %', app.state;
  END IF;

  INSERT INTO application_participant(participant_id, kind, state) VALUES (p_participant_id, 'PERSON', 'ACTIVE');
  INSERT INTO application_membership(
    membership_id, participant_id, state, member_type, standing, established_at,
    eligibility_policy_version, eligibility_evidence_ids, public_member_id
  ) VALUES (
    p_membership_id, p_participant_id, 'INACTIVE', 'PRIMARY', 'INITIAL_FEE_DUE', p_now,
    'verified-enrollment-v1', ARRAY[app.application_id], p_public_member_id
  );
  INSERT INTO member_session(session_id, membership_id, participant_id, state, expires_at)
    VALUES (p_session_id, p_membership_id, p_participant_id, 'ACTIVE', p_session_expires_at);
  UPDATE membership_application SET state = 'SUBMITTED', verified_at = p_now, resulting_membership_id = p_membership_id
    WHERE membership_application.application_id = app.application_id AND state = 'PENDING_VERIFICATION';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'enrollment application transition lost'; END IF;

  challenge_state := 'USED'; challenge_attempts := ch.attempts;
  application_id := app.application_id; membership_id := p_membership_id; public_member_id := p_public_member_id;
  session_id := p_session_id; idempotent := false; RETURN NEXT;
END $$;

COMMENT ON TABLE enrollment_campaign IS 'Server-resolved institutional enrollment context. A client-supplied employer label is never authoritative on its own when a campaign token is present.';
COMMENT ON TABLE enrollment_verification_challenge IS 'One-time contact verification gating membership provisioning. Distinct from member_auth_challenge, which re-authenticates an already-numbered member.';
