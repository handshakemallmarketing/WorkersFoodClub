-- J20 / UC-05 durable canonical catalog administration.
CREATE TABLE IF NOT EXISTS catalog_category (
 category_id text PRIMARY KEY,
 name text NOT NULL UNIQUE CHECK(length(trim(name))>0),
 active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL CHECK(length(trim(created_by))>0),
 updated_by text NOT NULL CHECK(length(trim(updated_by))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catalog_specification (
 specification_id text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 name text NOT NULL CHECK(length(trim(name))>0),
 base_unit text NOT NULL CHECK(length(trim(base_unit))>0),
 category_id text NOT NULL REFERENCES catalog_category(category_id) ON DELETE RESTRICT,
 active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL CHECK(length(trim(created_by))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(specification_id,version)
);
CREATE INDEX IF NOT EXISTS catalog_specification_active_lookup_idx ON catalog_specification(specification_id,version DESC) WHERE active;
CREATE OR REPLACE FUNCTION catalog_one_active_specification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.active AND EXISTS (SELECT 1 FROM catalog_specification s WHERE s.specification_id=NEW.specification_id AND s.active AND (s.specification_id,s.version)<>(NEW.specification_id,NEW.version)) THEN
  RAISE EXCEPTION 'CATALOG_MULTIPLE_ACTIVE_SPECIFICATION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS catalog_one_active_specification_guard_trg ON catalog_specification;
CREATE CONSTRAINT TRIGGER catalog_one_active_specification_guard_trg AFTER INSERT OR UPDATE OF active ON catalog_specification DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_one_active_specification_guard();
CREATE TABLE IF NOT EXISTS catalog_listing (
 listing_id text PRIMARY KEY,
 sku text NOT NULL UNIQUE CHECK(length(trim(sku))>0),
 specification_id text NOT NULL,
 specification_version integer NOT NULL,
 display_name text NOT NULL CHECK(length(trim(display_name))>0),
 active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL CHECK(length(trim(created_by))>0),
 updated_by text NOT NULL CHECK(length(trim(updated_by))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(specification_id,specification_version) REFERENCES catalog_specification(specification_id,version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS catalog_listing_spec_idx ON catalog_listing(specification_id,specification_version);
CREATE TABLE IF NOT EXISTS catalog_audit_event (
 event_id text PRIMARY KEY,
 entity_type text NOT NULL CHECK(entity_type IN ('CATEGORY','SPECIFICATION','LISTING')),
 entity_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('CREATE','PUBLISH','UPDATE','DEACTIVATE','REACTIVATE')),
 actor_id text NOT NULL CHECK(length(trim(actor_id))>0),
 before_state jsonb,
 after_state jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catalog_audit_entity_idx ON catalog_audit_event(entity_type,entity_id,occurred_at DESC);