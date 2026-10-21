CREATE SCHEMA "core";
--> statement-breakpoint
CREATE TYPE "core"."file_scan_status" AS ENUM('pending', 'clean', 'infected');--> statement-breakpoint
CREATE TYPE "core"."module_key" AS ENUM('core', 'slis', 'me', 'blis', 'proc');--> statement-breakpoint
CREATE TYPE "core"."org_type" AS ENUM('pcu', 'rbda', 'scheme', 'sector', 'contractor', 'consultant', 'other');--> statement-breakpoint
CREATE TYPE "core"."record_status" AS ENUM('draft', 'submitted', 'approved', 'returned');--> statement-breakpoint
CREATE TYPE "core"."scope_type" AS ENUM('national', 'state', 'rbda', 'scheme', 'sector');--> statement-breakpoint
CREATE TYPE "core"."wua_level" AS ENUM('apex', 'sector', 'unit');--> statement-breakpoint
CREATE TYPE "core"."wua_office" AS ENUM('chair', 'secretary', 'treasurer', 'other');--> statement-breakpoint
CREATE TABLE "core"."app_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"email" "citext" NOT NULL,
	"username" "citext",
	"full_name" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"totp_secret_enc" "bytea",
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_sign_ins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "app_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "core"."assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"module" "core"."module_key" NOT NULL,
	"scope_type" "core"."scope_type" NOT NULL,
	"scope_state_id" uuid,
	"scope_org_id" uuid,
	"can_capture_offline" boolean DEFAULT false NOT NULL,
	"valid_from_on" date,
	"valid_to_on" date,
	CONSTRAINT "assignment_scope_check" CHECK (((scope_type = 'national' and scope_state_id is null and scope_org_id is null) or (scope_type = 'state' and scope_state_id is not null and scope_org_id is null) or (scope_type in ('rbda','scheme','sector') and scope_org_id is not null and scope_state_id is null))),
	CONSTRAINT "assignment_dates_check" CHECK ("valid_from_on" IS NULL OR "valid_to_on" IS NULL OR "valid_from_on" <= "valid_to_on")
);
--> statement-breakpoint
CREATE TABLE "core"."file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"storage_key" text NOT NULL,
	"original_name" text,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"scan_status" "core"."file_scan_status" DEFAULT 'pending' NOT NULL,
	"owner_entity" text,
	"owner_id" uuid,
	CONSTRAINT "file_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "file_size_bytes_check" CHECK ("size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."lga" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"geom" geometry(MultiPolygon, 4326),
	CONSTRAINT "lga_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."lookup_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"module" "core"."module_key" NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lookup_type_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "core"."lookup_value" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lookup_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."organisation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"type" "core"."org_type" NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"address" text,
	"phone" text,
	"email" text,
	"geom" geometry(Geometry, 4326),
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."organisation_state" (
	"organisation_id" uuid NOT NULL,
	"state_id" uuid NOT NULL,
	CONSTRAINT "organisation_state_organisation_id_state_id_pk" PRIMARY KEY("organisation_id","state_id")
);
--> statement-breakpoint
CREATE TABLE "core"."role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "role_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "core"."role_permission" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "core"."setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "core"."state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"geom" geometry(MultiPolygon, 4326),
	CONSTRAINT "state_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."ward" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lga_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"geom" geometry(MultiPolygon, 4326),
	CONSTRAINT "ward_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."wua" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"level" "core"."wua_level" NOT NULL,
	"parent_id" uuid,
	"organisation_id" uuid NOT NULL,
	"ward_id" uuid,
	"reg_no" text,
	"name" text NOT NULL,
	"address" text,
	"bank_name" text,
	"bank_account_enc" "bytea",
	"is_operational" boolean DEFAULT false NOT NULL,
	"has_maintenance_fund" boolean DEFAULT false NOT NULL,
	"import_batch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "core"."wua_officer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"wua_id" uuid NOT NULL,
	"office" "core"."wua_office" NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"from_on" date,
	"to_on" date,
	CONSTRAINT "wua_officer_dates_check" CHECK ("from_on" IS NULL OR "to_on" IS NULL OR "from_on" <= "to_on")
);
--> statement-breakpoint
ALTER TABLE "core"."app_user" ADD CONSTRAINT "app_user_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."app_user" ADD CONSTRAINT "app_user_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "core"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_scope_state_id_state_id_fk" FOREIGN KEY ("scope_state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_scope_org_id_organisation_id_fk" FOREIGN KEY ("scope_org_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."file" ADD CONSTRAINT "file_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."file" ADD CONSTRAINT "file_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."lga" ADD CONSTRAINT "lga_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."lookup_value" ADD CONSTRAINT "lookup_value_lookup_type_id_lookup_type_id_fk" FOREIGN KEY ("lookup_type_id") REFERENCES "core"."lookup_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisation" ADD CONSTRAINT "organisation_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisation" ADD CONSTRAINT "organisation_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisation" ADD CONSTRAINT "organisation_parent_id_organisation_id_fk" FOREIGN KEY ("parent_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisation_state" ADD CONSTRAINT "organisation_state_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisation_state" ADD CONSTRAINT "organisation_state_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "core"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."setting" ADD CONSTRAINT "setting_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."state" ADD CONSTRAINT "state_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."state" ADD CONSTRAINT "state_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."ward" ADD CONSTRAINT "ward_lga_id_lga_id_fk" FOREIGN KEY ("lga_id") REFERENCES "core"."lga"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua" ADD CONSTRAINT "wua_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua" ADD CONSTRAINT "wua_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua" ADD CONSTRAINT "wua_parent_id_wua_id_fk" FOREIGN KEY ("parent_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua" ADD CONSTRAINT "wua_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua" ADD CONSTRAINT "wua_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "core"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua_officer" ADD CONSTRAINT "wua_officer_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua_officer" ADD CONSTRAINT "wua_officer_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."wua_officer" ADD CONSTRAINT "wua_officer_wua_id_wua_id_fk" FOREIGN KEY ("wua_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_user_id_idx" ON "core"."assignment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assignment_role_id_idx" ON "core"."assignment" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "assignment_scope_state_id_idx" ON "core"."assignment" USING btree ("scope_state_id");--> statement-breakpoint
CREATE INDEX "assignment_scope_org_id_idx" ON "core"."assignment" USING btree ("scope_org_id");--> statement-breakpoint
CREATE INDEX "lga_state_id_idx" ON "core"."lga" USING btree ("state_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lookup_value_type_code_unique" ON "core"."lookup_value" USING btree ("lookup_type_id","code");--> statement-breakpoint
CREATE INDEX "organisation_parent_id_idx" ON "core"."organisation" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_code_active_unique" ON "core"."organisation" USING btree ("code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ward_lga_id_idx" ON "core"."ward" USING btree ("lga_id");--> statement-breakpoint
CREATE INDEX "wua_organisation_id_idx" ON "core"."wua" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "wua_parent_id_idx" ON "core"."wua" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "wua_ward_id_idx" ON "core"."wua" USING btree ("ward_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wua_org_reg_no_active_unique" ON "core"."wua" USING btree ("organisation_id","reg_no") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "wua_officer_wua_id_idx" ON "core"."wua_officer" USING btree ("wua_id");