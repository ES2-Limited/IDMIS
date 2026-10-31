-- Migration 0013: SLIS Materialised Views, Report Refresh & Export Jobs
-- Schema: slis

-- 1. Create slis.report_refresh table
CREATE TABLE IF NOT EXISTS "slis"."report_refresh" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "refreshed_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Create slis.export_job table
CREATE TABLE IF NOT EXISTS "slis"."export_job" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "core"."app_user"("id"),
  "dataset" text NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued',
  "file_id" uuid REFERENCES "core"."file"("id"),
  "row_count" integer,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "export_job_user_id_idx" ON "slis"."export_job"("user_id");
CREATE INDEX IF NOT EXISTS "export_job_status_idx" ON "slis"."export_job"("status");

-- 3. Materialised View: slis.mv_farmers_by_scope
DROP MATERIALIZED VIEW IF EXISTS "slis"."mv_farmers_by_scope" CASCADE;
CREATE MATERIALIZED VIEW "slis"."mv_farmers_by_scope" AS
SELECT
  f.scheme_id,
  f.sector_id,
  COALESCE(f.sector_id, '00000000-0000-0000-0000-000000000000'::uuid) AS sector_key,
  f.state_id,
  COALESCE(f.state_id, '00000000-0000-0000-0000-000000000000'::uuid) AS state_key,
  f.gender,
  COUNT(*)::integer AS farmer_count
FROM "slis"."farmer" f
WHERE f.status = 'approved' AND f.deleted_at IS NULL
GROUP BY f.scheme_id, f.sector_id, f.state_id, f.gender
WITH DATA;

CREATE UNIQUE INDEX "mv_farmers_by_scope_unique"
ON "slis"."mv_farmers_by_scope" (scheme_id, sector_key, state_key, gender);

-- 4. Materialised View: slis.mv_area_by_service
DROP MATERIALIZED VIEW IF EXISTS "slis"."mv_area_by_service" CASCADE;
CREATE MATERIALIZED VIEW "slis"."mv_area_by_service" AS
SELECT
  p.scheme_id,
  p.state_id,
  COALESCE(p.state_id, '00000000-0000-0000-0000-000000000000'::uuid) AS state_key,
  p.service_type,
  COALESCE(p.service_type, 'unspecified') AS service_key,
  ROUND(COALESCE(SUM(p.area_ha), 0), 4)::numeric(14,4) AS total_ha,
  COUNT(*)::integer AS plot_count
FROM "slis"."plot" p
WHERE p.status = 'approved' AND p.deleted_at IS NULL
GROUP BY p.scheme_id, p.state_id, p.service_type
WITH DATA;

CREATE UNIQUE INDEX "mv_area_by_service_unique"
ON "slis"."mv_area_by_service" (scheme_id, state_key, service_key);

-- 5. Materialised View: slis.mv_cropping
DROP MATERIALIZED VIEW IF EXISTS "slis"."mv_cropping" CASCADE;
CREATE MATERIALIZED VIEW "slis"."mv_cropping" AS
SELECT
  cp.scheme_id,
  p.state_id,
  COALESCE(p.state_id, '00000000-0000-0000-0000-000000000000'::uuid) AS state_key,
  cp.season_id,
  cp.crop_type_id,
  ROUND(COALESCE(SUM(cp.area_ha), 0), 4)::numeric(14,4) AS total_area_ha,
  ROUND(COALESCE(SUM(cp.yield_t), 0), 3)::numeric(14,3) AS total_yield_t,
  CASE
    WHEN COALESCE(SUM(cp.area_ha), 0) = 0 THEN NULL
    ELSE ROUND((COALESCE(SUM(cp.yield_t), 0) / SUM(cp.area_ha)), 4)::numeric(14,4)
  END AS avg_yield_t_ha
FROM "slis"."crop_production" cp
JOIN "slis"."plot" p ON cp.plot_id = p.id
WHERE cp.status = 'approved' AND cp.deleted_at IS NULL
GROUP BY cp.scheme_id, p.state_id, cp.season_id, cp.crop_type_id
WITH DATA;

CREATE UNIQUE INDEX "mv_cropping_unique"
ON "slis"."mv_cropping" (scheme_id, state_key, season_id, crop_type_id);

-- 6. Materialised View: slis.mv_fee_recovery
DROP MATERIALIZED VIEW IF EXISTS "slis"."mv_fee_recovery" CASCADE;
CREATE MATERIALIZED VIEW "slis"."mv_fee_recovery" AS
WITH billed AS (
  SELECT
    fb.scheme_id,
    os.state_id,
    COALESCE(os.state_id, '00000000-0000-0000-0000-000000000000'::uuid) AS state_key,
    fb.season_id,
    fb.wua_id,
    COALESCE(fb.wua_id, '00000000-0000-0000-0000-000000000000'::uuid) AS wua_key,
    COALESCE(SUM(fb.amount_ngn), 0)::numeric(14,2) AS billed_ngn
  FROM "slis"."fee_billing" fb
  LEFT JOIN "core"."organisation_state" os ON fb.scheme_id = os.organisation_id
  WHERE fb.deleted_at IS NULL
  GROUP BY fb.scheme_id, os.state_id, fb.season_id, fb.wua_id
),
collected AS (
  SELECT
    fc.scheme_id,
    os.state_id,
    COALESCE(os.state_id, '00000000-0000-0000-0000-000000000000'::uuid) AS state_key,
    fc.season_id,
    fc.wua_id,
    COALESCE(fc.wua_id, '00000000-0000-0000-0000-000000000000'::uuid) AS wua_key,
    COALESCE(SUM(fc.amount_ngn), 0)::numeric(14,2) AS collected_ngn
  FROM "slis"."fee_collection" fc
  LEFT JOIN "core"."organisation_state" os ON fc.scheme_id = os.organisation_id
  WHERE fc.deleted_at IS NULL AND fc.status IN ('recorded', 'approved')
  GROUP BY fc.scheme_id, os.state_id, fc.season_id, fc.wua_id
)
SELECT
  COALESCE(b.scheme_id, c.scheme_id) AS scheme_id,
  COALESCE(b.state_id, c.state_id) AS state_id,
  COALESCE(b.state_key, c.state_key) AS state_key,
  COALESCE(b.season_id, c.season_id) AS season_id,
  COALESCE(b.wua_id, c.wua_id) AS wua_id,
  COALESCE(b.wua_key, c.wua_key) AS wua_key,
  COALESCE(b.billed_ngn, 0)::numeric(14,2) AS billed_ngn,
  COALESCE(c.collected_ngn, 0)::numeric(14,2) AS collected_ngn,
  CASE
    WHEN COALESCE(b.billed_ngn, 0) = 0 THEN NULL
    ELSE ROUND(((COALESCE(c.collected_ngn, 0) / b.billed_ngn) * 100), 2)::numeric(7,2)
  END AS recovery_rate_pct
FROM billed b
FULL OUTER JOIN collected c
  ON b.scheme_id = c.scheme_id
  AND b.state_key = c.state_key
  AND b.season_id = c.season_id
  AND b.wua_key = c.wua_key
WITH DATA;

CREATE UNIQUE INDEX "mv_fee_recovery_unique"
ON "slis"."mv_fee_recovery" (scheme_id, state_key, season_id, wua_key);

-- 7. SECURITY DEFINER function slis.refresh_report_views()
CREATE OR REPLACE FUNCTION "slis"."refresh_report_views"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = slis, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY "slis"."mv_farmers_by_scope";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "slis"."mv_area_by_service";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "slis"."mv_cropping";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "slis"."mv_fee_recovery";

  INSERT INTO "slis"."report_refresh" ("id", "refreshed_at")
  VALUES (1, now())
  ON CONFLICT ("id") DO UPDATE SET "refreshed_at" = EXCLUDED."refreshed_at";
END;
$$;

-- Initialise report_refresh with now()
INSERT INTO "slis"."report_refresh" ("id", "refreshed_at")
VALUES (1, now())
ON CONFLICT ("id") DO NOTHING;

-- 8. Grants for idmis_app runtime role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'idmis_app') THEN
    GRANT USAGE ON SCHEMA "slis" TO idmis_app;
    GRANT SELECT ON "slis"."mv_farmers_by_scope" TO idmis_app;
    GRANT SELECT ON "slis"."mv_area_by_service" TO idmis_app;
    GRANT SELECT ON "slis"."mv_cropping" TO idmis_app;
    GRANT SELECT ON "slis"."mv_fee_recovery" TO idmis_app;
    GRANT SELECT, INSERT, UPDATE ON "slis"."report_refresh" TO idmis_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "slis"."export_job" TO idmis_app;
    GRANT EXECUTE ON FUNCTION "slis"."refresh_report_views"() TO idmis_app;
  END IF;
END
$$;
