ALTER TABLE "core"."sync_quarantine" ADD COLUMN IF NOT EXISTS "scheme_id" uuid REFERENCES "core"."organisation"("id");
--> statement-breakpoint
ALTER TABLE "core"."sync_quarantine" ADD COLUMN IF NOT EXISTS "state_id" uuid REFERENCES "core"."state"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_quarantine_scheme_id_idx" ON "core"."sync_quarantine" ("scheme_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_quarantine_state_id_idx" ON "core"."sync_quarantine" ("state_id");
