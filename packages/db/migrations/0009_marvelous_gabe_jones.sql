CREATE SCHEMA "slis";
--> statement-breakpoint
CREATE TABLE "core"."change_log" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."change_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity" text NOT NULL,
	"record_id" uuid NOT NULL,
	"op" text NOT NULL,
	"scheme_id" uuid,
	"state_id" uuid,
	"basin_id" uuid,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."sync_conflict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"op_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"record_id" uuid NOT NULL,
	"base_version" integer NOT NULL,
	"server_version" integer NOT NULL,
	"device_payload" jsonb NOT NULL,
	"server_payload" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"scheme_id" uuid
);
--> statement-breakpoint
CREATE TABLE "core"."sync_op" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"record_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"new_version" integer,
	"errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "core"."sync_quarantine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"op_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"action" text NOT NULL,
	"record_id" uuid NOT NULL,
	"base_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"quarantined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" text,
	"audit_log_id" uuid
);
--> statement-breakpoint
CREATE TABLE "slis"."crop_production" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"plot_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"crop_type_id" uuid NOT NULL,
	"area_ha" numeric(10, 4) NOT NULL,
	"yield_t" numeric(12, 3),
	"planted_on" date,
	"harvested_on" date
);
--> statement-breakpoint
CREATE TABLE "slis"."farm" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"scheme_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"name" text NOT NULL,
	"geom" geometry(Geometry, 4326)
);
--> statement-breakpoint
CREATE TABLE "slis"."farmer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"sector_id" uuid,
	"farmer_code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"other_names" text,
	"gender" text NOT NULL,
	"birth_year" integer,
	"phone" text,
	"village" text,
	"ward_id" uuid,
	"state_id" uuid,
	"household_id" uuid,
	"unit_wua_id" uuid,
	"farmer_group_id" uuid,
	"marital_status_id" uuid,
	"next_of_kin_name" text,
	"next_of_kin_phone" text,
	"next_of_kin_relation" text,
	"photo_file_id" uuid,
	"location" geometry(Point, 4326),
	CONSTRAINT "farmer_gender_check" CHECK ("gender" IN ('female', 'male'))
);
--> statement-breakpoint
CREATE TABLE "slis"."farmer_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"scheme_id" uuid NOT NULL,
	"wua_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"group_type_id" uuid
);
--> statement-breakpoint
CREATE TABLE "slis"."farmer_identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"farmer_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"number_enc" text NOT NULL,
	"number_hash" text NOT NULL,
	"number_last4" text NOT NULL,
	"bank_name" text,
	"document_file_id" uuid,
	"unique_per_person" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slis"."fee_billing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"wua_id" uuid,
	"farmer_id" uuid,
	"amount_ngn" numeric(14, 2) NOT NULL,
	"due_date" date NOT NULL,
	CONSTRAINT "fee_billing_one_of_check" CHECK ((("wua_id" IS NOT NULL AND "farmer_id" IS NULL) OR ("wua_id" IS NULL AND "farmer_id" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "slis"."fee_collection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"billing_id" uuid,
	"wua_id" uuid,
	"farmer_id" uuid,
	"amount_ngn" numeric(14, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"receipt_no" text,
	"field_receipt_ref" text,
	CONSTRAINT "fee_collection_one_of_check" CHECK ((("wua_id" IS NOT NULL AND "farmer_id" IS NULL) OR ("wua_id" IS NULL AND "farmer_id" IS NOT NULL))),
	CONSTRAINT "fee_collection_device_receipt_check" CHECK ("device_id" IS NULL OR "field_receipt_ref" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "slis"."household" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"ward_id" uuid,
	"name" text NOT NULL,
	"settlement" text,
	"size" integer,
	"males" integer,
	"females" integer,
	"children" integer
);
--> statement-breakpoint
CREATE TABLE "slis"."plot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"farm_id" uuid,
	"sector_id" uuid NOT NULL,
	"plot_code" text NOT NULL,
	"area_ha" numeric(10, 4),
	"irrigation_type_id" uuid,
	"service_type" text,
	"ward_id" uuid,
	"state_id" uuid,
	"geom" geometry(Geometry, 4326),
	"gps_accuracy_m" numeric(6, 2),
	CONSTRAINT "plot_service_type_check" CHECK ("service_type" IS NULL OR "service_type" IN ('new', 'improved', 'none'))
);
--> statement-breakpoint
CREATE TABLE "slis"."plot_allocation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"plot_id" uuid NOT NULL,
	"farmer_id" uuid NOT NULL,
	"season_id" uuid,
	"tenure_id" uuid,
	"from_on" date,
	"to_on" date,
	CONSTRAINT "plot_alloc_dates_check" CHECK ("from_on" IS NULL OR "to_on" IS NULL OR "from_on" <= "to_on")
);
--> statement-breakpoint
CREATE TABLE "slis"."season" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"scheme_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "season_dates_check" CHECK ("ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE "slis"."stream_flow_reading" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"unit" text DEFAULT 'm3/s' NOT NULL,
	"gauge_height_m" numeric(8, 4),
	"location" geometry(Point, 4326)
);
--> statement-breakpoint
CREATE TABLE "slis"."training" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"trainer_name" text,
	"held_on" date NOT NULL,
	"venue" text,
	"topics_covered" text
);
--> statement-breakpoint
CREATE TABLE "slis"."training_attendance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"training_id" uuid NOT NULL,
	"farmer_id" uuid,
	"staff_user_id" uuid,
	"staff_name" text,
	"gender" text,
	"notes" text,
	CONSTRAINT "training_attendance_one_of_check" CHECK ((("farmer_id" IS NOT NULL AND "staff_user_id" IS NULL AND "staff_name" IS NULL) OR ("farmer_id" IS NULL AND ("staff_user_id" IS NOT NULL OR "staff_name" IS NOT NULL))))
);
--> statement-breakpoint
CREATE TABLE "slis"."water_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"level" text NOT NULL,
	"wua_id" uuid,
	"farmer_id" uuid,
	"season_id" uuid,
	"requested_volume_m3" numeric(14, 2),
	"period_from_on" date,
	"period_to_on" date,
	"decision" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	CONSTRAINT "water_request_level_check" CHECK ("level" IN ('apex', 'sector', 'unit', 'individual')),
	CONSTRAINT "water_request_decision_check" CHECK ("decision" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "water_request_one_of_check" CHECK ((("level" = 'individual' AND "farmer_id" IS NOT NULL AND "wua_id" IS NULL) OR ("level" != 'individual' AND "wua_id" IS NOT NULL AND "farmer_id" IS NULL)))
);
--> statement-breakpoint
ALTER TABLE "core"."lookup_value" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "core"."change_log" ADD CONSTRAINT "change_log_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."change_log" ADD CONSTRAINT "change_log_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sync_conflict" ADD CONSTRAINT "sync_conflict_op_id_sync_op_op_id_fk" FOREIGN KEY ("op_id") REFERENCES "core"."sync_op"("op_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sync_conflict" ADD CONSTRAINT "sync_conflict_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sync_conflict" ADD CONSTRAINT "sync_conflict_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sync_op" ADD CONSTRAINT "sync_op_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sync_quarantine" ADD CONSTRAINT "sync_quarantine_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sync_quarantine" ADD CONSTRAINT "sync_quarantine_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sync_quarantine" ADD CONSTRAINT "sync_quarantine_audit_log_id_audit_log_id_fk" FOREIGN KEY ("audit_log_id") REFERENCES "core"."audit_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_plot_id_plot_id_fk" FOREIGN KEY ("plot_id") REFERENCES "slis"."plot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "slis"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."crop_production" ADD CONSTRAINT "crop_production_crop_type_id_lookup_value_id_fk" FOREIGN KEY ("crop_type_id") REFERENCES "core"."lookup_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farm" ADD CONSTRAINT "farm_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farm" ADD CONSTRAINT "farm_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farm" ADD CONSTRAINT "farm_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farm" ADD CONSTRAINT "farm_sector_id_organisation_id_fk" FOREIGN KEY ("sector_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_sector_id_organisation_id_fk" FOREIGN KEY ("sector_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "core"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "slis"."household"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_unit_wua_id_wua_id_fk" FOREIGN KEY ("unit_wua_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_farmer_group_id_farmer_group_id_fk" FOREIGN KEY ("farmer_group_id") REFERENCES "slis"."farmer_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_marital_status_id_lookup_value_id_fk" FOREIGN KEY ("marital_status_id") REFERENCES "core"."lookup_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD CONSTRAINT "farmer_photo_file_id_file_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "core"."file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_group" ADD CONSTRAINT "farmer_group_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_group" ADD CONSTRAINT "farmer_group_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_group" ADD CONSTRAINT "farmer_group_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_group" ADD CONSTRAINT "farmer_group_wua_id_wua_id_fk" FOREIGN KEY ("wua_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_group" ADD CONSTRAINT "farmer_group_group_type_id_lookup_value_id_fk" FOREIGN KEY ("group_type_id") REFERENCES "core"."lookup_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ADD CONSTRAINT "farmer_identity_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ADD CONSTRAINT "farmer_identity_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ADD CONSTRAINT "farmer_identity_farmer_id_farmer_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "slis"."farmer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ADD CONSTRAINT "farmer_identity_document_type_id_lookup_value_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "core"."lookup_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ADD CONSTRAINT "farmer_identity_document_file_id_file_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "core"."file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "slis"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_wua_id_wua_id_fk" FOREIGN KEY ("wua_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_billing" ADD CONSTRAINT "fee_billing_farmer_id_farmer_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "slis"."farmer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "slis"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_billing_id_fee_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "slis"."fee_billing"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_wua_id_wua_id_fk" FOREIGN KEY ("wua_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."fee_collection" ADD CONSTRAINT "fee_collection_farmer_id_farmer_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "slis"."farmer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."household" ADD CONSTRAINT "household_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "core"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "slis"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_sector_id_organisation_id_fk" FOREIGN KEY ("sector_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_irrigation_type_id_lookup_value_id_fk" FOREIGN KEY ("irrigation_type_id") REFERENCES "core"."lookup_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "core"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD CONSTRAINT "plot_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_plot_id_plot_id_fk" FOREIGN KEY ("plot_id") REFERENCES "slis"."plot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_farmer_id_farmer_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "slis"."farmer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "slis"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."plot_allocation" ADD CONSTRAINT "plot_allocation_tenure_id_lookup_value_id_fk" FOREIGN KEY ("tenure_id") REFERENCES "core"."lookup_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."season" ADD CONSTRAINT "season_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."season" ADD CONSTRAINT "season_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."season" ADD CONSTRAINT "season_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."stream_flow_reading" ADD CONSTRAINT "stream_flow_reading_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training" ADD CONSTRAINT "training_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training_attendance" ADD CONSTRAINT "training_attendance_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training_attendance" ADD CONSTRAINT "training_attendance_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training_attendance" ADD CONSTRAINT "training_attendance_training_id_training_id_fk" FOREIGN KEY ("training_id") REFERENCES "slis"."training"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training_attendance" ADD CONSTRAINT "training_attendance_farmer_id_farmer_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "slis"."farmer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."training_attendance" ADD CONSTRAINT "training_attendance_staff_user_id_app_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_wua_id_wua_id_fk" FOREIGN KEY ("wua_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_farmer_id_farmer_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "slis"."farmer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "slis"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis"."water_request" ADD CONSTRAINT "water_request_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_log_xid_seq_idx" ON "core"."change_log" USING btree ("xid","seq");--> statement-breakpoint
CREATE INDEX "change_log_scheme_xid_seq_idx" ON "core"."change_log" USING btree ("scheme_id","xid","seq");--> statement-breakpoint
CREATE INDEX "change_log_state_xid_seq_idx" ON "core"."change_log" USING btree ("state_id","xid","seq");--> statement-breakpoint
CREATE INDEX "change_log_entity_record_idx" ON "core"."change_log" USING btree ("entity","record_id");--> statement-breakpoint
CREATE INDEX "sync_conflict_op_id_idx" ON "core"."sync_conflict" USING btree ("op_id");--> statement-breakpoint
CREATE INDEX "sync_conflict_scheme_status_idx" ON "core"."sync_conflict" USING btree ("scheme_id","status");--> statement-breakpoint
CREATE INDEX "sync_conflict_record_id_idx" ON "core"."sync_conflict" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "sync_op_device_id_idx" ON "core"."sync_op" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sync_op_record_id_idx" ON "core"."sync_op" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "sync_quarantine_device_id_idx" ON "core"."sync_quarantine" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sync_quarantine_quarantined_at_idx" ON "core"."sync_quarantine" USING btree ("quarantined_at");--> statement-breakpoint
CREATE INDEX "sync_quarantine_resolved_at_idx" ON "core"."sync_quarantine" USING btree ("resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crop_prod_plot_season_crop_unique" ON "slis"."crop_production" USING btree ("plot_id","season_id","crop_type_id");--> statement-breakpoint
CREATE INDEX "crop_prod_scheme_id_idx" ON "slis"."crop_production" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "crop_prod_season_id_idx" ON "slis"."crop_production" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "crop_prod_status_idx" ON "slis"."crop_production" USING btree ("status");--> statement-breakpoint
CREATE INDEX "farm_scheme_id_idx" ON "slis"."farm" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "farm_sector_id_idx" ON "slis"."farm" USING btree ("sector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "farmer_scheme_code_unique" ON "slis"."farmer" USING btree ("scheme_id","farmer_code");--> statement-breakpoint
CREATE INDEX "farmer_scheme_id_idx" ON "slis"."farmer" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "farmer_state_id_idx" ON "slis"."farmer" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "farmer_ward_id_idx" ON "slis"."farmer" USING btree ("ward_id");--> statement-breakpoint
CREATE INDEX "farmer_phone_idx" ON "slis"."farmer" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "farmer_status_idx" ON "slis"."farmer" USING btree ("status");--> statement-breakpoint
CREATE INDEX "farmer_group_scheme_id_idx" ON "slis"."farmer_group" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "farmer_group_wua_id_idx" ON "slis"."farmer_group" USING btree ("wua_id");--> statement-breakpoint
CREATE UNIQUE INDEX "farmer_identity_person_idx" ON "slis"."farmer_identity" USING btree ("document_type_id","number_hash") WHERE "unique_per_person" = true;--> statement-breakpoint
CREATE INDEX "farmer_identity_farmer_id_idx" ON "slis"."farmer_identity" USING btree ("farmer_id");--> statement-breakpoint
CREATE INDEX "farmer_identity_doc_type_hash_idx" ON "slis"."farmer_identity" USING btree ("document_type_id","number_hash");--> statement-breakpoint
CREATE INDEX "fee_billing_scheme_id_idx" ON "slis"."fee_billing" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "fee_billing_season_id_idx" ON "slis"."fee_billing" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "fee_billing_status_idx" ON "slis"."fee_billing" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_collection_device_receipt_unique" ON "slis"."fee_collection" USING btree ("device_id","field_receipt_ref") WHERE "device_id" IS NOT NULL AND "field_receipt_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_collection_receipt_no_unique" ON "slis"."fee_collection" USING btree ("receipt_no") WHERE "receipt_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "fee_collection_scheme_id_idx" ON "slis"."fee_collection" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "fee_collection_season_id_idx" ON "slis"."fee_collection" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "fee_collection_status_idx" ON "slis"."fee_collection" USING btree ("status");--> statement-breakpoint
CREATE INDEX "household_scheme_id_idx" ON "slis"."household" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "household_ward_id_idx" ON "slis"."household" USING btree ("ward_id");--> statement-breakpoint
CREATE INDEX "household_status_idx" ON "slis"."household" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_scheme_code_unique" ON "slis"."plot" USING btree ("scheme_id","plot_code");--> statement-breakpoint
CREATE INDEX "plot_scheme_id_idx" ON "slis"."plot" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "plot_sector_id_idx" ON "slis"."plot" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "plot_ward_id_idx" ON "slis"."plot" USING btree ("ward_id");--> statement-breakpoint
CREATE INDEX "plot_state_id_idx" ON "slis"."plot" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "plot_status_idx" ON "slis"."plot" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plot_alloc_plot_id_idx" ON "slis"."plot_allocation" USING btree ("plot_id");--> statement-breakpoint
CREATE INDEX "plot_alloc_farmer_id_idx" ON "slis"."plot_allocation" USING btree ("farmer_id");--> statement-breakpoint
CREATE INDEX "plot_alloc_season_id_idx" ON "slis"."plot_allocation" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "plot_alloc_status_idx" ON "slis"."plot_allocation" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "season_scheme_name_unique" ON "slis"."season" USING btree ("scheme_id","name");--> statement-breakpoint
CREATE INDEX "season_scheme_id_idx" ON "slis"."season" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "stream_flow_scheme_id_idx" ON "slis"."stream_flow_reading" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "stream_flow_station_id_idx" ON "slis"."stream_flow_reading" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "stream_flow_read_at_idx" ON "slis"."stream_flow_reading" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "stream_flow_status_idx" ON "slis"."stream_flow_reading" USING btree ("status");--> statement-breakpoint
CREATE INDEX "training_scheme_id_idx" ON "slis"."training" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "training_held_on_idx" ON "slis"."training" USING btree ("held_on");--> statement-breakpoint
CREATE INDEX "training_status_idx" ON "slis"."training" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "training_attendance_farmer_unique" ON "slis"."training_attendance" USING btree ("training_id","farmer_id") WHERE "farmer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "training_attendance_training_id_idx" ON "slis"."training_attendance" USING btree ("training_id");--> statement-breakpoint
CREATE INDEX "water_request_scheme_id_idx" ON "slis"."water_request" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "water_request_season_id_idx" ON "slis"."water_request" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "water_request_status_idx" ON "slis"."water_request" USING btree ("status");