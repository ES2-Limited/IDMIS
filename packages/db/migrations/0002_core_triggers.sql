CREATE OR REPLACE FUNCTION "core"."bump_version_and_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "trg_bump_version_app_user"
BEFORE UPDATE ON "core"."app_user"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_bump_version_state"
BEFORE UPDATE ON "core"."state"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_bump_version_organisation"
BEFORE UPDATE ON "core"."organisation"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_bump_version_wua"
BEFORE UPDATE ON "core"."wua"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_bump_version_wua_officer"
BEFORE UPDATE ON "core"."wua_officer"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_bump_version_assignment"
BEFORE UPDATE ON "core"."assignment"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_bump_version_file"
BEFORE UPDATE ON "core"."file"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "core"."fill_state_id_from_ward"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ward_id IS NOT NULL THEN
    SELECT l.state_id INTO NEW.state_id
    FROM "core"."ward" w
    JOIN "core"."lga" l ON l.id = w.lga_id
    WHERE w.id = NEW.ward_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
