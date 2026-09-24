-- Admin-editable annual membership fee. Previously this value lived only in
-- a Vercel env var (ANNUAL_MEMBERSHIP_FEE_MINOR), invisible and uneditable
-- without infrastructure tooling access -- the root cause of BLV2-DEC-040's
-- silent invoice-creation failure. This table is now the source of truth;
-- the env var remains a fallback for any environment that has not yet been
-- configured through the admin UI.
CREATE TABLE IF NOT EXISTS membership_fee_configuration (
  config_id text PRIMARY KEY,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL CHECK (length(trim(created_by)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_fee_configuration_one_active_uq
  ON membership_fee_configuration(currency) WHERE active;

CREATE OR REPLACE FUNCTION set_membership_fee_configuration(
  p_config_id text,
  p_amount_minor bigint,
  p_currency text,
  p_actor_id text
) RETURNS TABLE(config_id text, amount_minor bigint, currency text, active boolean, created_at timestamptz)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  -- A stable lock (not a row lock, since the prior active row may not exist
  -- yet) closes concurrent-write races the same way catalog publication does.
  PERFORM pg_advisory_xact_lock(hashtextextended('membership-fee-configuration:'||p_currency,0));
  UPDATE membership_fee_configuration SET active=false
  WHERE membership_fee_configuration.currency=p_currency AND membership_fee_configuration.active;
  RETURN QUERY
  INSERT INTO membership_fee_configuration(config_id,amount_minor,currency,active,created_by)
  VALUES(p_config_id,p_amount_minor,p_currency,true,p_actor_id)
  RETURNING membership_fee_configuration.config_id,membership_fee_configuration.amount_minor,membership_fee_configuration.currency,membership_fee_configuration.active,membership_fee_configuration.created_at;
END;
$$;
