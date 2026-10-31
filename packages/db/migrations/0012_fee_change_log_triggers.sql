CREATE OR REPLACE FUNCTION "core"."trg_slis_change_log"()
RETURNS TRIGGER AS $$
DECLARE
  v_row jsonb;
  v_record_id uuid;
  v_scheme_id uuid;
  v_state_id uuid;
  v_op text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_row := to_jsonb(OLD);
    v_record_id := OLD.id;
    v_op := 'delete';
  ELSIF (TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    v_row := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_op := 'delete';
  ELSE
    v_row := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_op := 'upsert';
  END IF;

  IF (v_row ? 'scheme_id') AND (v_row ->> 'scheme_id') IS NOT NULL THEN
    v_scheme_id := (v_row ->> 'scheme_id')::uuid;
  END IF;

  IF (v_row ? 'state_id') AND (v_row ->> 'state_id') IS NOT NULL THEN
    v_state_id := (v_row ->> 'state_id')::uuid;
  END IF;

  -- Scope lookups for child rows without direct scheme/state columns
  IF v_scheme_id IS NULL AND TG_TABLE_NAME = 'plot_allocation' THEN
    SELECT p.scheme_id, p.state_id INTO v_scheme_id, v_state_id
    FROM "slis"."plot" p
    WHERE p.id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.plot_id ELSE NEW.plot_id END);
  END IF;

  IF v_scheme_id IS NULL AND TG_TABLE_NAME = 'training_attendance' THEN
    SELECT t.scheme_id INTO v_scheme_id
    FROM "slis"."training" t
    WHERE t.id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.training_id ELSE NEW.training_id END);
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

  INSERT INTO "core"."change_log" (xid, entity, record_id, op, scheme_id, state_id)
  VALUES (pg_current_xact_id(), TG_TABLE_NAME, v_record_id, v_op, v_scheme_id, v_state_id);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_change_log_fee_billing" ON "slis"."fee_billing";
CREATE TRIGGER "trg_change_log_fee_billing"
AFTER INSERT OR UPDATE OR DELETE ON "slis"."fee_billing"
FOR EACH ROW EXECUTE FUNCTION "core"."trg_slis_change_log"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_change_log_fee_collection" ON "slis"."fee_collection";
CREATE TRIGGER "trg_change_log_fee_collection"
AFTER INSERT OR UPDATE OR DELETE ON "slis"."fee_collection"
FOR EACH ROW EXECUTE FUNCTION "core"."trg_slis_change_log"();

