-- Migration 0017: BLIS Schema, Tables, Partitioning, and Spatial Indexes
-- Schemas: blis

CREATE SCHEMA IF NOT EXISTS "blis";

-- 1. Basin
CREATE TABLE IF NOT EXISTS "blis"."basin" (
  "id" uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "alt_name" text,
  "hydrological_unit" text,
  "main_river" text,
  "rbda_id" uuid REFERENCES "core"."organisation"("id"),
  "geom" geometry(MultiPolygon, 4326),
  "import_batch_id" uuid REFERENCES "core"."import_batch"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "basin_geom_gist_idx" ON "blis"."basin" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "basin_rbda_id_idx" ON "blis"."basin" ("rbda_id");

-- 2. Basin Morphometry
CREATE TABLE IF NOT EXISTS "blis"."basin_morphometry" (
  "id" uuid PRIMARY KEY,
  "basin_id" uuid NOT NULL REFERENCES "blis"."basin"("id"),
  "measured_on" date NOT NULL,
  "lowest_point_m" numeric(10, 2),
  "highest_point_m" numeric(10, 2),
  "avg_slope_pct" numeric(8, 3),
  "stream_count" integer,
  "stream_length_total_km" numeric(12, 3),
  "stream_length_avg_km" numeric(10, 3),
  "drainage_density" numeric(10, 4),
  "stream_order" smallint,
  "relief_m" numeric(10, 2),
  "length_km" numeric(10, 3),
  "perimeter_km" numeric(10, 3),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone,
  CONSTRAINT "basin_morphometry_basin_date_unique" UNIQUE ("basin_id", "measured_on")
);

CREATE INDEX IF NOT EXISTS "basin_morphometry_basin_id_idx" ON "blis"."basin_morphometry" ("basin_id");

-- 3. Station
CREATE TABLE IF NOT EXISTS "blis"."station" (
  "id" uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "basin_id" uuid NOT NULL REFERENCES "blis"."basin"("id"),
  "station_type_id" uuid NOT NULL REFERENCES "core"."lookup_value"("id"),
  "ward_id" uuid REFERENCES "core"."ward"("id"),
  "river" text,
  "geom" geometry(Point, 4326) NOT NULL,
  "installed_on" date,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "import_batch_id" uuid REFERENCES "core"."import_batch"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "station_geom_gist_idx" ON "blis"."station" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "station_basin_id_idx" ON "blis"."station" ("basin_id");
CREATE INDEX IF NOT EXISTS "station_type_id_idx" ON "blis"."station" ("station_type_id");

-- 4. Parameter
CREATE TABLE IF NOT EXISTS "blis"."parameter" (
  "id" uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "default_unit" text NOT NULL
);

-- 5. Measurement (Range partitioned by observed_at)
CREATE TABLE IF NOT EXISTS "blis"."measurement" (
  "id" uuid NOT NULL,
  "station_id" uuid NOT NULL REFERENCES "blis"."station"("id"),
  "parameter_id" uuid NOT NULL REFERENCES "blis"."parameter"("id"),
  "observed_at" timestamp with time zone NOT NULL,
  "value" numeric(16, 4) NOT NULL,
  "unit" text NOT NULL,
  "quality" text NOT NULL DEFAULT 'raw' CHECK ("quality" IN ('raw', 'checked', 'suspect')),
  "source" text NOT NULL CHECK ("source" IN ('manual', 'import', 'logger')),
  "import_batch_id" uuid REFERENCES "core"."import_batch"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  PRIMARY KEY ("id", "observed_at"),
  CONSTRAINT "measurement_station_param_observed_unique" UNIQUE ("station_id", "parameter_id", "observed_at")
) PARTITION BY RANGE ("observed_at");

CREATE INDEX IF NOT EXISTS "measurement_observed_at_idx" ON "blis"."measurement" ("observed_at");
CREATE INDEX IF NOT EXISTS "measurement_station_id_idx" ON "blis"."measurement" ("station_id");

-- 6. Partition helper stored procedure
CREATE OR REPLACE FUNCTION blis.ensure_measurement_partition(p_year int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = blis, pg_temp
AS $$
DECLARE
  v_table_name text;
  v_start_date text;
  v_end_date text;
BEGIN
  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Invalid partition year: %', p_year;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('blis_partition_' || p_year::text));

  v_table_name := 'measurement_' || p_year;
  v_start_date := p_year || '-01-01 00:00:00+00';
  v_end_date := (p_year + 1) || '-01-01 00:00:00+00';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'blis' AND c.relname = v_table_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE blis.%I PARTITION OF blis.measurement FOR VALUES FROM (%L) TO (%L);',
      v_table_name,
      v_start_date,
      v_end_date
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON blis.%I TO idmis_app;',
      v_table_name
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION blis.ensure_measurement_partition(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION blis.ensure_measurement_partition(int) TO idmis_app;

-- Create initial partitions for current year (2026) and next year (2027)
SELECT blis.ensure_measurement_partition(2026);
SELECT blis.ensure_measurement_partition(2027);

-- 7. Reservoir
CREATE TABLE IF NOT EXISTS "blis"."reservoir" (
  "id" uuid PRIMARY KEY,
  "basin_id" uuid NOT NULL REFERENCES "blis"."basin"("id"),
  "name" text NOT NULL,
  "river" text,
  "area_km2" numeric(12, 3),
  "volume_mcm" numeric(14, 3),
  "mean_depth_m" numeric(8, 2),
  "max_depth_m" numeric(8, 2),
  "relative_depth" numeric(8, 4),
  "max_length_km" numeric(10, 3),
  "max_width_km" numeric(10, 3),
  "mean_elevation_m" numeric(10, 2),
  "sediment_ratio" numeric(10, 4),
  "fetch_km" numeric(10, 3),
  "depth_ratio" numeric(10, 4),
  "volume_development" numeric(10, 4),
  "geom" geometry(MultiPolygon, 4326),
  "import_batch_id" uuid REFERENCES "core"."import_batch"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "reservoir_geom_gist_idx" ON "blis"."reservoir" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "reservoir_basin_id_idx" ON "blis"."reservoir" ("basin_id");

-- 8. Dam
CREATE TABLE IF NOT EXISTS "blis"."dam" (
  "id" uuid PRIMARY KEY,
  "code" text UNIQUE,
  "name" text NOT NULL,
  "alt_name" text,
  "basin_id" uuid NOT NULL REFERENCES "blis"."basin"("id"),
  "reservoir_id" uuid REFERENCES "blis"."reservoir"("id"),
  "secondary_of_dam_id" uuid REFERENCES "blis"."dam"("id"),
  "purpose_id" uuid REFERENCES "core"."lookup_value"("id"),
  "category_id" uuid REFERENCES "core"."lookup_value"("id"),
  "completion_year" smallint,
  "foundation" text,
  "height_m" numeric(8, 2),
  "crest_length_m" numeric(10, 2),
  "body_volume_mcm" numeric(12, 3),
  "spillway_type" text,
  "spillway_capacity_m3s" numeric(12, 2),
  "reservoir_capacity_mcm" numeric(14, 3),
  "reservoir_area_km2" numeric(12, 3),
  "reservoir_length_km" numeric(10, 3),
  "hydropower_mw" numeric(10, 2),
  "mean_annual_energy_gwh" numeric(12, 2),
  "irrigated_area_ha" numeric(12, 2),
  "catchment_km2" numeric(12, 2),
  "owner_org_id" uuid REFERENCES "core"."organisation"("id"),
  "consultant_org_id" uuid REFERENCES "core"."organisation"("id"),
  "contractor_org_id" uuid REFERENCES "core"."organisation"("id"),
  "lga_id" uuid REFERENCES "core"."lga"("id"),
  "nearest_town" text,
  "resettlement_notes" text,
  "notes" text,
  "geom" geometry(Point, 4326),
  "altitude_m" numeric(8, 2),
  "import_batch_id" uuid REFERENCES "core"."import_batch"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "dam_geom_gist_idx" ON "blis"."dam" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "dam_basin_id_idx" ON "blis"."dam" ("basin_id");
CREATE INDEX IF NOT EXISTS "dam_reservoir_id_idx" ON "blis"."dam" ("reservoir_id");

-- 9. Dam Safety Inspection
CREATE TABLE IF NOT EXISTS "blis"."dam_safety_inspection" (
  "id" uuid PRIMARY KEY,
  "dam_id" uuid NOT NULL REFERENCES "blis"."dam"("id"),
  "inspected_on" date NOT NULL,
  "next_due_on" date,
  "hazard_class_id" uuid REFERENCES "core"."lookup_value"("id"),
  "specific_hazards" text,
  "safety_contact" text,
  "staff_on_site" integer,
  "staff_qualifications" text,
  "safety_budget_ngn" numeric(16, 2),
  "meets_standard" boolean,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'draft',
  "submitted_by" uuid REFERENCES "core"."app_user"("id"),
  "submitted_at" timestamp with time zone,
  "approved_by" uuid REFERENCES "core"."app_user"("id"),
  "approved_at" timestamp with time zone,
  "returned_by" uuid REFERENCES "core"."app_user"("id"),
  "returned_at" timestamp with time zone,
  "return_comment" text,
  "device_id" uuid REFERENCES "core"."device"("id"),
  "import_batch_id" uuid REFERENCES "core"."import_batch"("id"),
  CONSTRAINT "dam_safety_inspection_dam_date_unique" UNIQUE ("dam_id", "inspected_on")
);

CREATE INDEX IF NOT EXISTS "dam_safety_inspection_dam_id_idx" ON "blis"."dam_safety_inspection" ("dam_id");
CREATE INDEX IF NOT EXISTS "dam_safety_inspection_status_idx" ON "blis"."dam_safety_inspection" ("status");

-- 10. Dam Component Condition
CREATE TABLE IF NOT EXISTS "blis"."dam_component_condition" (
  "inspection_id" uuid NOT NULL REFERENCES "blis"."dam_safety_inspection"("id") ON DELETE CASCADE,
  "component" text NOT NULL CHECK ("component" IN ('dam_body', 'spillway_1', 'spillway_2', 'inlet', 'outlet', 'electrical', 'mechanical')),
  "rating_id" uuid NOT NULL REFERENCES "core"."lookup_value"("id"),
  "notes" text,
  PRIMARY KEY ("inspection_id", "component")
);

-- 11. Bio Resource Occurrence
CREATE TABLE IF NOT EXISTS "blis"."bio_resource_occurrence" (
  "id" uuid PRIMARY KEY,
  "basin_id" uuid NOT NULL REFERENCES "blis"."basin"("id"),
  "resource_id" uuid NOT NULL REFERENCES "core"."lookup_value"("id"),
  "occurrence_id" uuid NOT NULL REFERENCES "core"."lookup_value"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "bio_resource_occurrence_basin_id_idx" ON "blis"."bio_resource_occurrence" ("basin_id");

-- 12. Water Use Priority
CREATE TABLE IF NOT EXISTS "blis"."water_use_priority" (
  "id" uuid PRIMARY KEY,
  "basin_id" uuid NOT NULL REFERENCES "blis"."basin"("id"),
  "water_use_id" uuid NOT NULL REFERENCES "core"."lookup_value"("id"),
  "priority_id" uuid NOT NULL REFERENCES "core"."lookup_value"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "water_use_priority_basin_id_idx" ON "blis"."water_use_priority" ("basin_id");

-- 13. Stakeholder
CREATE TABLE IF NOT EXISTS "blis"."stakeholder" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL,
  "abbreviation" text,
  "category_id" uuid REFERENCES "core"."lookup_value"("id"),
  "contact_name" text,
  "phone" text,
  "email" text,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "stakeholder_category_id_idx" ON "blis"."stakeholder" ("category_id");

-- 14. Stakeholder Basin
CREATE TABLE IF NOT EXISTS "blis"."stakeholder_basin" (
  "stakeholder_id" uuid NOT NULL REFERENCES "blis"."stakeholder"("id") ON DELETE CASCADE,
  "basin_id" uuid NOT NULL REFERENCES "blis"."basin"("id") ON DELETE CASCADE,
  PRIMARY KEY ("stakeholder_id", "basin_id")
);

CREATE INDEX IF NOT EXISTS "stakeholder_basin_basin_id_idx" ON "blis"."stakeholder_basin" ("basin_id");

-- 15. Map Layer
CREATE TABLE IF NOT EXISTS "blis"."map_layer" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL,
  "layer_type_id" uuid NOT NULL REFERENCES "core"."lookup_value"("id"),
  "basin_id" uuid REFERENCES "blis"."basin"("id"),
  "source_file_id" uuid REFERENCES "core"."file"("id"),
  "details" text,
  "area_km2" numeric(12, 3),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "map_layer_basin_id_idx" ON "blis"."map_layer" ("basin_id");
CREATE INDEX IF NOT EXISTS "map_layer_type_id_idx" ON "blis"."map_layer" ("layer_type_id");

-- 16. Map Feature
CREATE TABLE IF NOT EXISTS "blis"."map_feature" (
  "id" uuid PRIMARY KEY,
  "layer_id" uuid NOT NULL REFERENCES "blis"."map_layer"("id") ON DELETE CASCADE,
  "properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "geom" geometry(Geometry, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS "map_feature_geom_gist_idx" ON "blis"."map_feature" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "map_feature_layer_id_idx" ON "blis"."map_feature" ("layer_id");

-- 17. Database Permissions for idmis_app
GRANT USAGE ON SCHEMA "blis" TO idmis_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "blis" TO idmis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "blis" TO idmis_app;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA "blis" TO idmis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "blis" GRANT USAGE, SELECT ON SEQUENCES TO idmis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "blis" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO idmis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "blis" GRANT EXECUTE ON ROUTINES TO idmis_app;

