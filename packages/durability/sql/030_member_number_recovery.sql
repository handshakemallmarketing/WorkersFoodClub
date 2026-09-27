-- Member Number recovery is identity recovery, not membership activation.
CREATE TABLE IF NOT EXISTS member_number_recovery_challenge (
  challenge_id text PRIMARY KEY,
  membership_id text NOT NULL REFERENCES application_membership(membership_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('EMAIL','PHONE')),
  destination_hash text NOT NULL,
  code_hash text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','USED','EXPIRED','REVOKED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_number_recovery_membership_idx ON member_number_recovery_challenge(membership_id,created_at DESC);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM member_number_recovery_challenge WHERE attempts<0 OR attempts>5) THEN
    RAISE EXCEPTION 'member_number_recovery_challenge contains attempts outside the certified 0..5 range';
  END IF;
  IF EXISTS (SELECT 1 FROM member_number_recovery_challenge WHERE (state='USED')<>(used_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'member_number_recovery_challenge contains inconsistent USED/used_at state';
  END IF;
END;
$$;
ALTER TABLE member_number_recovery_challenge DROP CONSTRAINT IF EXISTS member_number_recovery_challenge_attempts_check;
ALTER TABLE member_number_recovery_challenge ADD CONSTRAINT member_number_recovery_challenge_attempts_check CHECK (attempts BETWEEN 0 AND 5);
ALTER TABLE member_number_recovery_challenge DROP CONSTRAINT IF EXISTS member_number_recovery_challenge_used_at_ck;
ALTER TABLE member_number_recovery_challenge ADD CONSTRAINT member_number_recovery_challenge_used_at_ck CHECK ((state='USED')=(used_at IS NOT NULL));
COMMENT ON TABLE member_number_recovery_challenge IS 'Single-use verified-contact challenges for recovering an immutable Member Number. Recovery never changes membership standing or rights.';

CREATE OR REPLACE FUNCTION create_member_number_recovery_challenge(
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
  IF (SELECT count(*) FROM member_number_recovery_challenge
      WHERE membership_id=p_membership_id AND created_at>now()-interval '15 minutes') >= 5 THEN
    RETURN;
  END IF;
  INSERT INTO member_number_recovery_challenge(
    challenge_id,membership_id,channel,destination_hash,code_hash,state,expires_at
  ) VALUES(
    p_challenge_id,p_membership_id,p_channel,p_destination_hash,p_code_hash,'OPEN',p_expires_at
  );
  RETURN QUERY SELECT p_challenge_id;
END;
$$;

CREATE OR REPLACE FUNCTION verify_member_number_recovery_challenge(
  p_challenge_id text,
  p_code_hash text,
  p_now timestamptz
) RETURNS TABLE(membership_id text,code_hash text,attempts integer,state text)
LANGUAGE sql
AS $$
  UPDATE member_number_recovery_challenge
  SET attempts=CASE WHEN member_number_recovery_challenge.code_hash=p_code_hash THEN attempts ELSE attempts+1 END,
      state=CASE WHEN member_number_recovery_challenge.code_hash=p_code_hash THEN 'USED'
                 WHEN attempts+1>=5 THEN 'REVOKED' ELSE state END,
      used_at=CASE WHEN member_number_recovery_challenge.code_hash=p_code_hash THEN now() ELSE used_at END
  WHERE challenge_id=p_challenge_id
    AND state='OPEN'
    AND expires_at>p_now
    AND attempts<5
  RETURNING membership_id,member_number_recovery_challenge.code_hash,attempts,state;
$$;
