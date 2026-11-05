-- 1. Create Materialised View: blis.mv_dam_status
DROP MATERIALIZED VIEW IF EXISTS "blis"."mv_dam_status" CASCADE;
CREATE MATERIALIZED VIEW "blis"."mv_dam_status" AS
SELECT DISTINCT ON (i.dam_id)
  i.dam_id,
  i.id AS inspection_id,
  i.inspected_on,
  COALESCE(i.meets_standard, false) AS meets_standard,
  i.hazard_class_id,
  lv.label AS hazard_class,
  i.next_due_on,
  (i.next_due_on IS NOT NULL AND i.next_due_on < CURRENT_DATE) AS is_overdue,
  i.approved_at
FROM "blis"."dam_safety_inspection" i
LEFT JOIN "core"."lookup_value" lv ON lv.id = i.hazard_class_id
WHERE i.status = 'approved' AND i.deleted_at IS NULL
ORDER BY i.dam_id, i.inspected_on DESC, i.approved_at DESC, i.created_at DESC
WITH DATA;

CREATE UNIQUE INDEX "mv_dam_status_dam_id_unique"
ON "blis"."mv_dam_status" (dam_id);

CREATE INDEX "mv_dam_status_meets_standard_idx"
ON "blis"."mv_dam_status" (meets_standard);

-- 2. Refresh Function for blis.mv_dam_status
CREATE OR REPLACE FUNCTION "blis"."refresh_mv_dam_status"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = blis, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY "blis"."mv_dam_status";
END;
$$;

REVOKE EXECUTE ON FUNCTION "blis"."refresh_mv_dam_status"() FROM PUBLIC;

-- 3. Permissions for idmis_app runtime role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'idmis_app') THEN
    GRANT SELECT ON "blis"."mv_dam_status" TO idmis_app;
    GRANT EXECUTE ON FUNCTION "blis"."refresh_mv_dam_status"() TO idmis_app;
  END IF;
END $$;

-- 4. Move Indicators 5 and 7 to computed and clean up stale manual values
DELETE FROM "me"."indicator_value"
WHERE "indicator_id" IN (
  SELECT "id" FROM "me"."indicator" WHERE "code" IN ('5', '7')
) AND "source" = 'manual';

UPDATE "me"."indicator"
SET "method" = 'computed',
    "compute_key" = 'blis.dams_safe'
WHERE "code" = '5';

UPDATE "me"."indicator"
SET "method" = 'computed',
    "compute_key" = 'blis.rivers_gauged'
WHERE "code" = '7';

