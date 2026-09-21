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
CREATE UNIQUE INDEX IF NOT EXISTS catalog_specification_one_active_uq ON catalog_specification(specification_id) WHERE active;
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
CREATE UNIQUE INDEX IF NOT EXISTS catalog_category_normalized_name_uq ON catalog_category(lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS catalog_listing_normalized_sku_uq ON catalog_listing(lower(btrim(sku)));
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

CREATE OR REPLACE FUNCTION catalog_mutate_category(
 p_category_id text,
 p_name text,
 p_active boolean,
 p_actor_id text,
 p_event_id text,
 p_require_active boolean DEFAULT false
) RETURNS TABLE(category_id text,name text,active boolean) LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
 v_prior catalog_category%ROWTYPE;
 v_changed catalog_category%ROWTYPE;
BEGIN
 -- Publication takes the same stable lock before reading the category. Taking
 -- it before the UPDATE gives the mutation a post-wait READ COMMITTED snapshot.
 PERFORM pg_advisory_xact_lock(hashtextextended('catalog-category:'||p_category_id,0));
 SELECT * INTO v_prior FROM catalog_category c
 WHERE c.category_id=p_category_id
 FOR UPDATE;
 IF NOT FOUND OR (p_require_active AND NOT v_prior.active) THEN RETURN; END IF;
 UPDATE catalog_category c SET
  name=COALESCE(NULLIF(p_name,''),c.name),
  active=COALESCE(p_active,c.active),
  updated_by=p_actor_id,
  updated_at=now()
 WHERE c.category_id=p_category_id
 RETURNING c.* INTO v_changed;
 INSERT INTO catalog_audit_event(event_id,entity_type,entity_id,action,actor_id,before_state,after_state)
 VALUES(p_event_id,'CATEGORY',p_category_id,
  CASE WHEN v_changed.active AND NOT v_prior.active THEN 'REACTIVATE'
       WHEN NOT v_changed.active AND v_prior.active THEN 'DEACTIVATE'
       ELSE 'UPDATE' END,
  p_actor_id,to_jsonb(v_prior),to_jsonb(v_changed));
 RETURN QUERY SELECT v_changed.category_id,v_changed.name,v_changed.active;
END;
$$;

CREATE OR REPLACE FUNCTION catalog_specification_active_chain_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 v_category_active boolean;
BEGIN
 IF NEW.active THEN
  SELECT c.active INTO v_category_active
  FROM catalog_category c
  WHERE c.category_id=NEW.category_id
  FOR SHARE;
  IF NOT FOUND OR NOT v_category_active THEN
   RAISE EXCEPTION 'CATALOG_SPECIFICATION_CATEGORY_NOT_ACTIVE' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.active AND NOT NEW.active AND EXISTS (
  SELECT 1 FROM catalog_listing l
  WHERE l.specification_id=OLD.specification_id AND l.specification_version=OLD.version AND l.active
 ) THEN
  RAISE EXCEPTION 'CATALOG_SPECIFICATION_HAS_ACTIVE_LISTING' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS catalog_specification_active_chain_guard_trg ON catalog_specification;
CREATE TRIGGER catalog_specification_active_chain_guard_trg
BEFORE INSERT OR UPDATE OF active,category_id,specification_id,version ON catalog_specification
FOR EACH ROW EXECUTE FUNCTION catalog_specification_active_chain_guard();

CREATE OR REPLACE FUNCTION catalog_listing_active_chain_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 v_category_id text;
 v_category_active boolean;
BEGIN
 IF NEW.active THEN
  SELECT s.category_id INTO v_category_id
  FROM catalog_specification s
  WHERE s.specification_id=NEW.specification_id
    AND s.version=NEW.specification_version
    AND s.active
  FOR SHARE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'CATALOG_LISTING_SOURCE_NOT_ACTIVE' USING ERRCODE='23514';
  END IF;
  SELECT c.active INTO v_category_active
  FROM catalog_category c
  WHERE c.category_id=v_category_id
  FOR SHARE;
  IF NOT FOUND OR NOT v_category_active THEN
   RAISE EXCEPTION 'CATALOG_LISTING_SOURCE_NOT_ACTIVE' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS catalog_listing_active_chain_guard_trg ON catalog_listing;
CREATE TRIGGER catalog_listing_active_chain_guard_trg
BEFORE INSERT OR UPDATE OF active,specification_id,specification_version ON catalog_listing
FOR EACH ROW EXECUTE FUNCTION catalog_listing_active_chain_guard();

CREATE OR REPLACE FUNCTION catalog_category_active_chain_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.active AND NOT NEW.active AND EXISTS (
  SELECT 1 FROM catalog_specification s WHERE s.category_id=OLD.category_id AND s.active
 ) THEN
  RAISE EXCEPTION 'CATALOG_CATEGORY_HAS_ACTIVE_SPECIFICATION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS catalog_category_active_chain_guard_trg ON catalog_category;
CREATE TRIGGER catalog_category_active_chain_guard_trg
BEFORE UPDATE OF active ON catalog_category
FOR EACH ROW EXECUTE FUNCTION catalog_category_active_chain_guard();

CREATE OR REPLACE FUNCTION catalog_publish_specification_and_listing(
 p_listing_id text,
 p_sku text,
 p_specification_id text,
 p_version integer,
 p_display_name text,
 p_specification_name text,
 p_base_unit text,
 p_category_id text,
 p_actor_id text,
 p_listing_event_id text,
 p_specification_event_id text,
 p_supersede_event_id text
) RETURNS TABLE(
 listing_id text,
 sku text,
 display_name text,
 active boolean,
 specification_id text,
 specification_version integer
) LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
 v_category_active boolean;
 v_latest_version integer;
 v_listing_exists boolean := false;
 v_prior_listing catalog_listing%ROWTYPE;
 v_prior_specification catalog_specification%ROWTYPE;
 v_new_specification catalog_specification%ROWTYPE;
 v_listing catalog_listing%ROWTYPE;
BEGIN
 -- A stable per-specification transaction lock closes concurrent publication write skew.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_specification_id,0));
 -- Category mutation uses this same lock before its UPDATE snapshot, so a
 -- publication and deactivation cannot both commit across READ COMMITTED.
 PERFORM pg_advisory_xact_lock(hashtextextended('catalog-category:'||p_category_id,0));

 SELECT c.active INTO v_category_active
 FROM catalog_category c
 WHERE c.category_id=p_category_id
 FOR SHARE;
 IF NOT FOUND OR NOT v_category_active THEN
  RAISE EXCEPTION 'CATALOG_CATEGORY_NOT_ACTIVE' USING ERRCODE='23514';
 END IF;

 SELECT max(s.version) INTO v_latest_version
 FROM catalog_specification s
 WHERE s.specification_id=p_specification_id;
 IF p_version<=COALESCE(v_latest_version,0) THEN
  RAISE EXCEPTION 'CATALOG_SPECIFICATION_VERSION_NOT_ADVANCED' USING ERRCODE='23514';
 END IF;

 SELECT * INTO v_prior_listing
 FROM catalog_listing l
 WHERE l.listing_id=p_listing_id
 FOR UPDATE;
 v_listing_exists := FOUND;
 IF v_listing_exists AND v_prior_listing.specification_id<>p_specification_id THEN
  RAISE EXCEPTION 'CATALOG_LISTING_SPECIFICATION_REBOUND' USING ERRCODE='23514';
 END IF;

 SELECT * INTO v_prior_specification
 FROM catalog_specification s
 WHERE s.specification_id=p_specification_id AND s.active
 FOR UPDATE;

 -- Preserve active listing => active specification => active category at every statement boundary.
 IF v_listing_exists AND v_prior_listing.active THEN
  UPDATE catalog_listing SET active=false,updated_by=p_actor_id,updated_at=now()
  WHERE catalog_listing.listing_id=p_listing_id;
 END IF;
 UPDATE catalog_specification SET active=false
 WHERE catalog_specification.specification_id=p_specification_id AND catalog_specification.active;

 INSERT INTO catalog_specification(specification_id,version,name,base_unit,category_id,active,created_by)
 VALUES(p_specification_id,p_version,p_specification_name,p_base_unit,p_category_id,true,p_actor_id)
 RETURNING * INTO v_new_specification;

 INSERT INTO catalog_listing(listing_id,sku,specification_id,specification_version,display_name,active,created_by,updated_by)
 VALUES(p_listing_id,p_sku,p_specification_id,p_version,p_display_name,true,p_actor_id,p_actor_id)
 ON CONFLICT(listing_id) DO UPDATE SET
  sku=EXCLUDED.sku,
  specification_version=EXCLUDED.specification_version,
  display_name=EXCLUDED.display_name,
  active=true,
  updated_by=p_actor_id,
  updated_at=now()
 WHERE catalog_listing.specification_id=EXCLUDED.specification_id
 RETURNING catalog_listing.* INTO v_listing;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'CATALOG_LISTING_SPECIFICATION_REBOUND' USING ERRCODE='23514';
 END IF;

 IF v_prior_specification.specification_id IS NOT NULL THEN
  INSERT INTO catalog_audit_event(event_id,entity_type,entity_id,action,actor_id,before_state)
  VALUES(p_supersede_event_id,'SPECIFICATION',v_prior_specification.specification_id||':'||v_prior_specification.version,'DEACTIVATE',p_actor_id,to_jsonb(v_prior_specification));
 END IF;
 INSERT INTO catalog_audit_event(event_id,entity_type,entity_id,action,actor_id,after_state)
 VALUES(p_specification_event_id,'SPECIFICATION',p_specification_id||':'||p_version,'PUBLISH',p_actor_id,to_jsonb(v_new_specification));
 INSERT INTO catalog_audit_event(event_id,entity_type,entity_id,action,actor_id,before_state,after_state)
 VALUES(p_listing_event_id,'LISTING',p_listing_id,CASE WHEN v_listing_exists THEN 'UPDATE' ELSE 'CREATE' END,p_actor_id,CASE WHEN v_listing_exists THEN to_jsonb(v_prior_listing) ELSE NULL END,to_jsonb(v_listing));

 RETURN QUERY SELECT v_listing.listing_id,v_listing.sku,v_listing.display_name,v_listing.active,v_listing.specification_id,v_listing.specification_version;
END;
$$;
