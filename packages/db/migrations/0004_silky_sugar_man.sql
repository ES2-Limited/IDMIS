ALTER TABLE "core"."wua" ADD COLUMN "state_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."wua" ADD CONSTRAINT "wua_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wua_state_id_idx" ON "core"."wua" USING btree ("state_id");--> statement-breakpoint
CREATE TRIGGER "trg_fill_state_id_from_ward_wua"
BEFORE INSERT OR UPDATE ON "core"."wua"
FOR EACH ROW EXECUTE FUNCTION "core"."fill_state_id_from_ward"();
