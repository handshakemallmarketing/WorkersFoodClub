-- Native member authentication challenge race safety.
-- This migration is additive so the hashes of previously rehearsed migrations
-- remain stable. Historical inconsistencies fail closed instead of being
-- silently normalized.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM member_auth_challenge WHERE attempts<0 OR attempts>5) THEN
    RAISE EXCEPTION 'member_auth_challenge contains attempts outside the certified 0..5 range';
  END IF;
  IF EXISTS (SELECT 1 FROM member_auth_challenge WHERE (state='USED')<>(used_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'member_auth_challenge contains inconsistent USED/used_at state';
  END IF;
END;
$$;

ALTER TABLE member_auth_challenge DROP CONSTRAINT IF EXISTS member_auth_challenge_attempts_check;
ALTER TABLE member_auth_challenge ADD CONSTRAINT member_auth_challenge_attempts_check CHECK (attempts BETWEEN 0 AND 5);
ALTER TABLE member_auth_challenge DROP CONSTRAINT IF EXISTS member_auth_challenge_used_at_ck;
ALTER TABLE member_auth_challenge ADD CONSTRAINT member_auth_challenge_used_at_ck CHECK ((state='USED')=(used_at IS NOT NULL));

CREATE OR REPLACE FUNCTION create_member_auth_challenge(
  p_challenge_id text,
  p_membership_id text,
  p_channel text,
  p_destination_hash text,
  p_code_hash text,
  p_expires_at timestamptz
) RETURNS TABLE(challenge_id text)
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_membership_id, 0));
  IF (SELECT count(*) FROM member_auth_challenge
      WHERE membership_id=p_membership_id AND created_at>now()-interval '15 minutes') >= 5 THEN
    RETURN;
  END IF;
  INSERT INTO member_auth_challenge(
    challenge_id,membership_id,channel,destination_hash,code_hash,state,expires_at
  ) VALUES(
    p_challenge_id,p_membership_id,p_channel,p_destination_hash,p_code_hash,'OPEN',p_expires_at
  );
  RETURN QUERY SELECT p_challenge_id;
END;
$$;

CREATE OR REPLACE FUNCTION verify_member_auth_challenge(
  p_challenge_id text,
  p_code_hash text,
  p_now timestamptz,
  p_session_id text,
  p_session_expires_at timestamptz
) RETURNS TABLE(
  membership_id text,
  code_hash text,
  attempts integer,
  state text,
  participant_id text,
  membership_state text,
  standing text,
  session_id text
)
LANGUAGE sql
AS $$
  WITH transitioned AS (
    UPDATE member_auth_challenge
    SET attempts=CASE WHEN member_auth_challenge.code_hash=p_code_hash THEN member_auth_challenge.attempts ELSE member_auth_challenge.attempts+1 END,
        state=CASE WHEN member_auth_challenge.code_hash=p_code_hash THEN 'USED'
                   WHEN member_auth_challenge.attempts+1>=5 THEN 'REVOKED' ELSE member_auth_challenge.state END,
        used_at=CASE WHEN member_auth_challenge.code_hash=p_code_hash THEN p_now ELSE member_auth_challenge.used_at END
    WHERE challenge_id=p_challenge_id
      AND member_auth_challenge.state='OPEN'
      AND expires_at>p_now
      AND member_auth_challenge.attempts<5
    RETURNING member_auth_challenge.membership_id,member_auth_challenge.code_hash,
              member_auth_challenge.attempts,member_auth_challenge.state
  ), challenge_context AS (
    SELECT t.membership_id,t.code_hash,t.attempts,t.state,
           m.participant_id,m.state AS membership_state,m.standing
    FROM transitioned t
    JOIN application_membership m ON m.membership_id=t.membership_id
  ), created AS (
    INSERT INTO member_session(session_id,membership_id,participant_id,state,expires_at)
    SELECT p_session_id,c.membership_id,c.participant_id,'ACTIVE',p_session_expires_at
    FROM challenge_context c
    WHERE c.code_hash=p_code_hash
      AND c.state='USED'
      AND ((c.membership_state='INACTIVE' AND c.standing='INITIAL_FEE_DUE')
        OR (c.membership_state='ACTIVE' AND c.standing IN ('ACTIVE','GRACE')))
    RETURNING member_session.session_id,member_session.membership_id
  )
  SELECT c.membership_id,c.code_hash,c.attempts,c.state,c.participant_id,
         c.membership_state,c.standing,created.session_id
  FROM challenge_context c
  LEFT JOIN created ON created.membership_id=c.membership_id;
$$;
