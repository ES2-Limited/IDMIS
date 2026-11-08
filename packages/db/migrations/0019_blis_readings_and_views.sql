-- 1. Create Materialised View: blis.mv_latest_reading
DROP MATERIALIZED VIEW IF EXISTS "blis"."mv_latest_reading" CASCADE;
CREATE MATERIALIZED VIEW "blis"."mv_latest_reading" AS
SELECT DISTINCT ON (station_id, parameter_id)
  station_id,
  parameter_id,
  observed_at,
  value,
  unit,
  quality
FROM "blis"."measurement"
ORDER BY station_id, parameter_id, observed_at DESC
WITH DATA;

CREATE UNIQUE INDEX "mv_latest_reading_unique"
ON "blis"."mv_latest_reading" (station_id, parameter_id);

CREATE INDEX "mv_latest_reading_param_idx"
ON "blis"."mv_latest_reading" (parameter_id);

-- 2. Refresh Function for blis.mv_latest_reading
CREATE OR REPLACE FUNCTION "blis"."refresh_mv_latest_reading"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = blis, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY "blis"."mv_latest_reading";
END;
$$;

REVOKE EXECUTE ON FUNCTION "blis"."refresh_mv_latest_reading"() FROM PUBLIC;

-- 3. Permissions for idmis_app runtime role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'idmis_app') THEN
    GRANT SELECT ON "blis"."mv_latest_reading" TO idmis_app;
    GRANT EXECUTE ON FUNCTION "blis"."refresh_mv_latest_reading"() TO idmis_app;
  END IF;
END $$;

