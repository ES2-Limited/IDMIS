ALTER TABLE "me"."indicator" ADD COLUMN IF NOT EXISTS "end_target" numeric(16, 4);
--> statement-breakpoint
ALTER TABLE "me"."indicator" ADD COLUMN IF NOT EXISTS "end_target_note" text;
--> statement-breakpoint
ALTER TABLE "me"."indicator" DROP CONSTRAINT IF EXISTS "indicator_method_compute_key_check";
--> statement-breakpoint
ALTER TABLE "me"."indicator" ADD CONSTRAINT "indicator_method_compute_key_check" CHECK (("method" = 'computed' AND "compute_key" IS NOT NULL) OR ("method" = 'survey') OR ("method" = 'manual' AND "compute_key" IS NULL));
