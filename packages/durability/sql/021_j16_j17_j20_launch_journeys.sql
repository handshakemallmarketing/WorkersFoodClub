-- J16/J17/J20 launch journey durability. Additive and fail-closed.
ALTER TABLE preview_member_offer ADD COLUMN IF NOT EXISTS min_order_quantity numeric;
ALTER TABLE preview_member_offer ADD COLUMN IF NOT EXISTS max_order_quantity numeric;
ALTER TABLE preview_member_offer ADD COLUMN IF NOT EXISTS campaign_capacity numeric;
ALTER TABLE preview_member_offer ADD CONSTRAINT preview_member_offer_min_order_check CHECK (min_order_quantity IS NULL OR min_order_quantity > 0);
ALTER TABLE preview_member_offer ADD CONSTRAINT preview_member_offer_max_order_check CHECK (max_order_quantity IS NULL OR max_order_quantity > 0);
ALTER TABLE preview_member_offer ADD CONSTRAINT preview_member_offer_order_range_check CHECK (min_order_quantity IS NULL OR max_order_quantity IS NULL OR max_order_quantity >= min_order_quantity);
ALTER TABLE preview_member_offer ADD CONSTRAINT preview_member_offer_capacity_check CHECK (campaign_capacity IS NULL OR campaign_capacity > 0);

CREATE TABLE IF NOT EXISTS fulfillment_release_code (
  release_code_id text PRIMARY KEY,
  fulfillment_id text NOT NULL,
  obligation_id text NOT NULL,
  code_hash text NOT NULL UNIQUE,
  issued_by_actor_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by_actor_id text,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','REDEEMED','REVOKED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state='REDEEMED' AND redeemed_at IS NOT NULL AND redeemed_by_actor_id IS NOT NULL) OR state<>'REDEEMED')
);
CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_release_code_one_active_per_fulfillment
  ON fulfillment_release_code(fulfillment_id) WHERE state='ACTIVE';
CREATE INDEX IF NOT EXISTS fulfillment_release_code_obligation_idx ON fulfillment_release_code(obligation_id,created_at DESC);
