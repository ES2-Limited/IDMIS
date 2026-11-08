CREATE TABLE IF NOT EXISTS "core"."report_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"file_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "core"."report_job" ADD CONSTRAINT "report_job_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "core"."report_job" ADD CONSTRAINT "report_job_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "core"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_job_user_id_idx" ON "core"."report_job" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_job_status_idx" ON "core"."report_job" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_job_created_at_idx" ON "core"."report_job" USING btree ("created_at");
