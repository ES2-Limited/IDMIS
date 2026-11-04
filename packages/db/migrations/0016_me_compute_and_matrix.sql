-- Migration 0016: M&E Computed Indicators, Compute Results & Indicator Matrix
-- Schemas: core, slis, me

-- 1. Core Organisation: Add irrigable_area_ha
ALTER TABLE "core"."organisation" ADD COLUMN IF NOT EXISTS "irrigable_area_ha" numeric(12, 4);

-- 2. SLIS Training: Add tags text[] NOT NULL DEFAULT '{}'
ALTER TABLE "slis"."training" ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}';

-- 3. Core Lookups: Add training_tag lookup type and values
INSERT INTO "core"."lookup_type" ("id", "key", "name", "module", "is_system")
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'training_tag',
  'Training Tag',
  'slis',
  true
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "core"."lookup_value" ("id", "lookup_type_id", "code", "label", "sort_order", "is_active")
SELECT
  v.id,
  lt.id,
  v.code,
  v.label,
  v.sort_order,
  true
FROM "core"."lookup_type" lt
CROSS JOIN (
  VALUES
    ('b1000000-0000-0000-0000-000000000001'::uuid, 'dam_safety', 'Dam Safety', 1),
    ('b1000000-0000-0000-0000-000000000002'::uuid, 'wua_governance', 'WUA Governance', 2),
    ('b1000000-0000-0000-0000-000000000003'::uuid, 'agronomy', 'Agronomy', 3),
    ('b1000000-0000-0000-0000-000000000004'::uuid, 'fee_management', 'Fee Management', 4),
    ('b1000000-0000-0000-0000-000000000005'::uuid, 'other', 'Other', 5)
) AS v(id, code, label, sort_order)
WHERE lt.key = 'training_tag'
ON CONFLICT ("lookup_type_id", "code") DO NOTHING;

-- 4. Create me.compute_result table
CREATE TABLE IF NOT EXISTS "me"."compute_result" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "indicator_id" uuid NOT NULL REFERENCES "me"."indicator"("id"),
  "period_year" smallint NOT NULL,
  "period_quarter" smallint NOT NULL,
  "scope_type" "core"."scope_type" NOT NULL,
  "scope_state_id" uuid REFERENCES "core"."state"("id"),
  "scope_org_id" uuid REFERENCES "core"."organisation"("id"),
  "disaggregation" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL,
  "message" text,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "compute_result_quarter_check" CHECK ("period_quarter" >= 1 AND "period_quarter" <= 4)
);

CREATE UNIQUE INDEX IF NOT EXISTS "compute_result_slot_unique"
ON "me"."compute_result" ("indicator_id", "period_year", "period_quarter", "scope_type", "scope_state_id", "scope_org_id", "disaggregation")
NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "compute_result_lookup_idx"
ON "me"."compute_result" ("indicator_id", "period_year", "period_quarter");

-- 5. Create Materialised View: me.mv_indicator_matrix
DROP MATERIALIZED VIEW IF EXISTS "me"."mv_indicator_matrix" CASCADE;
CREATE MATERIALIZED VIEW "me"."mv_indicator_matrix" AS
WITH slots AS (
  SELECT
    indicator_id,
    period_year,
    period_quarter,
    scope_type,
    scope_state_id,
    scope_org_id,
    disaggregation
  FROM "me"."compute_result"
  UNION
  SELECT
    indicator_id,
    period_year,
    period_quarter,
    scope_type,
    scope_state_id,
    scope_org_id,
    disaggregation
  FROM "me"."indicator_value"
  WHERE deleted_at IS NULL AND status = 'approved'
)
SELECT
  s.indicator_id,
  ind.code AS indicator_code,
  ind.name AS indicator_name,
  s.period_year,
  s.period_quarter,
  s.scope_type,
  s.scope_state_id,
  COALESCE(s.scope_state_id, '00000000-0000-0000-0000-000000000000'::uuid) AS state_key,
  s.scope_org_id,
  COALESCE(s.scope_org_id, '00000000-0000-0000-0000-000000000000'::uuid) AS org_key,
  s.disaggregation,
  s.disaggregation::text AS disaggregation_key,
  it.value AS target,
  ind.end_target,
  iv.value,
  COALESCE(cr.status, CASE WHEN iv.id IS NOT NULL THEN 'manual' ELSE 'pending' END) AS status,
  cr.message,
  CASE
    WHEN ind.end_target IS NOT NULL AND ind.end_target != 0 AND iv.value IS NOT NULL
    THEN ROUND((iv.value / ind.end_target * 100)::numeric, 2)
    ELSE NULL
  END AS pct_of_end_target,
  COALESCE(cr.computed_at, iv.computed_at) AS computed_at
FROM slots s
JOIN "me"."indicator" ind ON ind.id = s.indicator_id
LEFT JOIN "me"."indicator_value" iv ON
  iv.indicator_id = s.indicator_id
  AND iv.period_year = s.period_year
  AND iv.period_quarter = s.period_quarter
  AND iv.scope_type = s.scope_type
  AND COALESCE(iv.scope_state_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.scope_state_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND COALESCE(iv.scope_org_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.scope_org_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND iv.disaggregation = s.disaggregation
  AND iv.deleted_at IS NULL
  AND iv.status = 'approved'
LEFT JOIN "me"."compute_result" cr ON
  cr.indicator_id = s.indicator_id
  AND cr.period_year = s.period_year
  AND cr.period_quarter = s.period_quarter
  AND cr.scope_type = s.scope_type
  AND COALESCE(cr.scope_state_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.scope_state_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND COALESCE(cr.scope_org_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.scope_org_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND cr.disaggregation = s.disaggregation
LEFT JOIN "me"."indicator_target" it ON
  it.indicator_id = s.indicator_id
  AND it.year = s.period_year
  AND it.scope_type = s.scope_type
  AND COALESCE(it.scope_state_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.scope_state_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND COALESCE(it.scope_org_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.scope_org_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND it.deleted_at IS NULL
WITH DATA;

CREATE UNIQUE INDEX "mv_indicator_matrix_unique"
ON "me"."mv_indicator_matrix" (indicator_id, period_year, period_quarter, scope_type, state_key, org_key, disaggregation_key);

CREATE INDEX "mv_indicator_matrix_scope_idx"
ON "me"."mv_indicator_matrix" (period_year, period_quarter, scope_type);

-- 6. Refresh Function for me.mv_indicator_matrix
CREATE OR REPLACE FUNCTION "me"."refresh_mv_indicator_matrix"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = me, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY "me"."mv_indicator_matrix";
END;
$$;

REVOKE EXECUTE ON FUNCTION "me"."refresh_mv_indicator_matrix"() FROM PUBLIC;

-- 7. Permissions for idmis_app runtime role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'idmis_app') THEN
    GRANT USAGE ON SCHEMA "me" TO idmis_app;
    GRANT SELECT ON "me"."mv_indicator_matrix" TO idmis_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "me"."compute_result" TO idmis_app;
    GRANT EXECUTE ON FUNCTION "me"."refresh_mv_indicator_matrix"() TO idmis_app;
  END IF;
END
$$;
