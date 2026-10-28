DROP INDEX IF EXISTS "core"."assignment_user_id_idx";--> statement-breakpoint
CREATE INDEX "assignment_active_user_idx" ON "core"."assignment" USING btree ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "organisation_parent_type_idx" ON "core"."organisation" USING btree ("parent_id","type") WHERE "deleted_at" IS NULL;
