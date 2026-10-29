CREATE TYPE "core"."import_batch_status" AS ENUM('uploaded', 'validating', 'validated', 'validation_failed', 'committing', 'committed', 'commit_failed', 'undoing', 'undone', 'undo_failed');--> statement-breakpoint
CREATE TYPE "core"."import_row_status" AS ENUM('valid', 'error', 'duplicate', 'committed');--> statement-breakpoint
CREATE TABLE "core"."import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" text NOT NULL,
	"file_id" uuid NOT NULL,
	"status" "core"."import_batch_status" DEFAULT 'uploaded' NOT NULL,
	"scheme_id" uuid,
	"state_id" uuid,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"committed_rows" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"committed_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."import_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"parsed_data" jsonb,
	"status" "core"."import_row_status" NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"natural_key" text,
	"target_entity_id" uuid,
	"before_image" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."import_batch" ADD CONSTRAINT "import_batch_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "core"."file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_batch" ADD CONSTRAINT "import_batch_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_batch" ADD CONSTRAINT "import_batch_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_batch" ADD CONSTRAINT "import_batch_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_row" ADD CONSTRAINT "import_row_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "core"."import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batch_created_by_idx" ON "core"."import_batch" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "import_batch_state_id_idx" ON "core"."import_batch" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "import_batch_scheme_id_idx" ON "core"."import_batch" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "import_batch_status_idx" ON "core"."import_batch" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_row_batch_id_row_idx" ON "core"."import_row" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "import_row_batch_id_status_idx" ON "core"."import_row" USING btree ("batch_id","status");