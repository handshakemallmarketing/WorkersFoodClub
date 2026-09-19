-- J20 / UC-05 durable canonical catalog administration.
CREATE TABLE IF NOT EXISTS catalog_specification (
 specification_id text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 name text NOT NULL CHECK(length(trim(name))>0),
 base_unit text NOT NULL CHECK(length(trim(base_unit))>0),
 category text NOT NULL CHECK(length(trim(category))>0),
 active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL CHECK(length(trim(created_by))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(specification_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_specification_one_active_version_uq ON catalog_specification(specification_id) WHERE active;
CREATE TABLE IF NOT EXISTS catalog_listing (
 listing_id text PRIMARY KEY,
 sku text NOT NULL UNIQUE CHECK(length(trim(sku))>0),
 specification_id text NOT NULL,
 specification_version integer NOT NULL,
 display_name text NOT NULL CHECK(length(trim(display_name))>0),
 active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL CHECK(length(trim(created_by))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(specification_id,specification_version) REFERENCES catalog_specification(specification_id,version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS catalog_listing_spec_idx ON catalog_listing(specification_id,specification_version);
