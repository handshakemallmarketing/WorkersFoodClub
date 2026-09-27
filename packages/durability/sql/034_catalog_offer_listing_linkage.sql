-- Links the commerce "offer" table (preview_member_offer: price, quantity
-- limits, capacity, delivery/discount timing, status) to the governed J20
-- catalog (catalog_listing -> catalog_specification -> catalog_category:
-- product identity, versioning, audit trail). Previously these were two
-- unrelated systems: J20 defined what products exist, preview_member_offer
-- defined what members could actually order, and nothing connected them.
-- Nullable so existing offer rows created before this migration remain valid;
-- new/updated offers are required to name an active listing at the
-- application layer (api/catalog-offers.js), not by a NOT NULL constraint,
-- so this stays purely additive.
ALTER TABLE preview_member_offer ADD COLUMN IF NOT EXISTS listing_id text REFERENCES catalog_listing(listing_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS preview_member_offer_listing_idx ON preview_member_offer(listing_id);
