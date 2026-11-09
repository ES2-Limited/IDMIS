-- Custom SQL migration file, created by drizzle-kit
-- Migration: 0024_dam_inspection_change_log
CREATE OR REPLACE FUNCTION "core"."trg_slis_change_log"()
RETURNS TRIGGER AS $$
DECLARE
  v_row jsonb;
  v_record_id uuid;
  v_scheme_id uuid;
  v_state_id uuid;
  v_basin_id uuid;
  v_op text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_row := to_jsonb(OLD);
    v_record_id := (v_row ->> 'id')::uuid;
    v_op := 'delete';
  ELSIF (TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> 'deleted_at') IS NULL AND (to_jsonb(NEW) ->> 'deleted_at') IS NOT NULL) THEN
    v_row := to_jsonb(NEW);
    v_record_id := (v_row ->> 'id')::uuid;
    v_op := 'delete';
  ELSE
    v_row := to_jsonb(NEW);
    v_record_id := (v_row ->> 'id')::uuid;
    v_op := 'upsert';
  END IF;

  IF (v_row ? 'scheme_id') AND (v_row ->> 'scheme_id') IS NOT NULL THEN
    v_scheme_id := (v_row ->> 'scheme_id')::uuid;
  END IF;

  IF (v_row ? 'state_id') AND (v_row ->> 'state_id') IS NOT NULL THEN
    v_state_id := (v_row ->> 'state_id')::uuid;
  END IF;

  IF (v_row ? 'basin_id') AND (v_row ->> 'basin_id') IS NOT NULL THEN
    v_basin_id := (v_row ->> 'basin_id')::uuid;
  END IF;

  -- Scope lookups for child rows without direct scheme/state columns
  IF v_scheme_id IS NULL AND TG_TABLE_NAME = 'plot_allocation' THEN
    SELECT p.scheme_id, p.state_id INTO v_scheme_id, v_state_id
    FROM "slis"."plot" p
    WHERE p.id = (CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'plot_id')::uuid ELSE (to_jsonb(NEW) ->> 'plot_id')::uuid END);
  END IF;

  IF v_scheme_id IS NULL AND TG_TABLE_NAME = 'training_attendance' THEN
    SELECT t.scheme_id INTO v_scheme_id
    FROM "slis"."training" t
    WHERE t.id = (CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'training_id')::uuid ELSE (to_jsonb(NEW) ->> 'training_id')::uuid END);
  END IF;

  IF v_scheme_id IS NULL AND TG_TABLE_NAME = 'survey_answer' THEN
    SELECT sr.scheme_id INTO v_scheme_id
    FROM "me"."survey_response" sr
    WHERE sr.id = (CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'response_id')::uuid ELSE (to_jsonb(NEW) ->> 'response_id')::uuid END);
  END IF;

  IF TG_TABLE_NAME = 'dam_safety_inspection' THEN
    SELECT NULL, l.state_id, d.basin_id INTO v_scheme_id, v_state_id, v_basin_id
    FROM "blis"."dam" d
    LEFT JOIN "core"."lga" l ON l.id = d.lga_id
    WHERE d.id = (CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'dam_id')::uuid ELSE (to_jsonb(NEW) ->> 'dam_id')::uuid END);
  END IF;

  IF v_state_id IS NULL AND (v_row ? 'ward_id') AND (v_row ->> 'ward_id') IS NOT NULL THEN
    SELECT l.state_id INTO v_state_id
    FROM "core"."ward" w
    JOIN "core"."lga" l ON l.id = w.lga_id
    WHERE w.id = (v_row ->> 'ward_id')::uuid;
  END IF;

  IF v_state_id IS NULL AND v_scheme_id IS NOT NULL THEN
    SELECT os.state_id INTO v_state_id
    FROM "core"."organisation_state" os
    WHERE os.organisation_id = v_scheme_id
    LIMIT 1;
  END IF;

  INSERT INTO "core"."change_log" (xid, entity, record_id, op, scheme_id, state_id, basin_id)
  VALUES (pg_current_xact_id(), TG_TABLE_NAME, v_record_id, v_op, v_scheme_id, v_state_id, v_basin_id);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_change_log_dam_safety_inspection" ON "blis"."dam_safety_inspection";
CREATE TRIGGER "trg_change_log_dam_safety_inspection"
AFTER INSERT OR UPDATE OR DELETE ON "blis"."dam_safety_inspection"
FOR EACH ROW EXECUTE FUNCTION "core"."trg_slis_change_log"();
