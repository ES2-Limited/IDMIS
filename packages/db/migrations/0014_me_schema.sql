CREATE SCHEMA IF NOT EXISTS "me";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'me' AND t.typname = 'indicator_level') THEN
    CREATE TYPE "me"."indicator_level" AS ENUM('pdo', 'intermediate');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'me' AND t.typname = 'indicator_method') THEN
    CREATE TYPE "me"."indicator_method" AS ENUM('manual', 'computed', 'survey');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'me' AND t.typname = 'value_source') THEN
    CREATE TYPE "me"."value_source" AS ENUM('manual', 'computed', 'import');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."results_framework" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."indicator" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"framework_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" "me"."indicator_level" NOT NULL,
	"unit" text NOT NULL,
	"frequency" text DEFAULT 'annual' NOT NULL,
	"method" "me"."indicator_method" NOT NULL,
	"compute_key" text,
	"disaggregations" text[] DEFAULT '{}'::text[] NOT NULL,
	"baseline" numeric(16, 4),
	"baseline_year" smallint,
	"data_source" text,
	"responsible" text,
	CONSTRAINT "indicator_framework_code_unique" UNIQUE("framework_id","code"),
	CONSTRAINT "indicator_method_compute_key_check" CHECK (("method" <> 'computed' OR "compute_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."indicator_target" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"indicator_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"scope_type" "core"."scope_type" NOT NULL,
	"scope_state_id" uuid,
	"scope_org_id" uuid,
	"value" numeric(16, 4) NOT NULL,
	"import_batch_id" uuid,
	CONSTRAINT "indicator_target_slot_unique" UNIQUE NULLS NOT DISTINCT("indicator_id","year","scope_type","scope_state_id","scope_org_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."indicator_value" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"returned_at" timestamp with time zone,
	"returned_by" uuid,
	"return_comment" text,
	"import_batch_id" uuid,
	"indicator_id" uuid NOT NULL,
	"period_year" smallint NOT NULL,
	"period_quarter" smallint,
	"scope_type" "core"."scope_type" NOT NULL,
	"scope_state_id" uuid,
	"scope_org_id" uuid,
	"disaggregation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"value" numeric(16, 4) NOT NULL,
	"source" "me"."value_source" NOT NULL,
	"computed_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "indicator_value_quarter_check" CHECK (("period_quarter" IS NULL OR ("period_quarter" >= 1 AND "period_quarter" <= 4))),
	CONSTRAINT "indicator_value_slot_unique" UNIQUE NULLS NOT DISTINCT("indicator_id","period_year","period_quarter","scope_type","scope_state_id","scope_org_id","disaggregation")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."indicator_value_evidence" (
	"indicator_value_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "indicator_value_evidence_indicator_value_id_file_id_pk" PRIMARY KEY("indicator_value_id","file_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."survey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"survey_version" integer DEFAULT 1 NOT NULL,
	"scheme_id" uuid,
	"opens_on" date,
	"closes_on" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."survey_question" (
	"id" uuid PRIMARY KEY NOT NULL,
	"survey_id" uuid NOT NULL,
	"code" text NOT NULL,
	"text" text NOT NULL,
	"answer_type" text NOT NULL,
	"options" jsonb,
	"sort_order" integer NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "survey_question_survey_code_unique" UNIQUE("survey_id","code"),
	CONSTRAINT "survey_question_answer_type_check" CHECK ("answer_type" IN ('text','number','single','multi','date','gps'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."survey_response" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"returned_at" timestamp with time zone,
	"returned_by" uuid,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"survey_id" uuid NOT NULL,
	"scheme_id" uuid,
	"farmer_id" uuid,
	"household_id" uuid,
	"collected_at" timestamp with time zone NOT NULL,
	"location" geometry(Point, 4326)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."survey_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "survey_answer_response_question_unique" UNIQUE("response_id","question_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."scorecard" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"scheme_id" uuid NOT NULL,
	"period_year" smallint NOT NULL,
	"published_on" date,
	"file_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."matching_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"scheme_id" uuid NOT NULL,
	"wua_id" uuid,
	"purpose" text,
	"amount_ngn" numeric(14, 2),
	"approved_on" date,
	"disbursed_on" date,
	"import_batch_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "me"."tech_adoption" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"returned_at" timestamp with time zone,
	"returned_by" uuid,
	"return_comment" text,
	"device_id" uuid,
	"import_batch_id" uuid,
	"scheme_id" uuid NOT NULL,
	"farmer_id" uuid,
	"technology_id" uuid NOT NULL,
	"gender" text,
	"adopted_on" date,
	CONSTRAINT "tech_adoption_gender_check" CHECK (("gender" IS NULL OR "gender" IN ('female','male')))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator" ADD CONSTRAINT "indicator_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator" ADD CONSTRAINT "indicator_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_framework_id_results_framework_id_fk') THEN
    ALTER TABLE "me"."indicator" ADD CONSTRAINT "indicator_framework_id_results_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "me"."results_framework"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_target_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator_target" ADD CONSTRAINT "indicator_target_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_target_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator_target" ADD CONSTRAINT "indicator_target_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_target_indicator_id_indicator_id_fk') THEN
    ALTER TABLE "me"."indicator_target" ADD CONSTRAINT "indicator_target_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "me"."indicator"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_target_scope_state_id_state_id_fk') THEN
    ALTER TABLE "me"."indicator_target" ADD CONSTRAINT "indicator_target_scope_state_id_state_id_fk" FOREIGN KEY ("scope_state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_target_scope_org_id_organisation_id_fk') THEN
    ALTER TABLE "me"."indicator_target" ADD CONSTRAINT "indicator_target_scope_org_id_organisation_id_fk" FOREIGN KEY ("scope_org_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_target_import_batch_id_import_batch_id_fk') THEN
    ALTER TABLE "me"."indicator_target" ADD CONSTRAINT "indicator_target_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_submitted_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_approved_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_returned_by_app_user_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_import_batch_id_import_batch_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_indicator_id_indicator_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "me"."indicator"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_scope_state_id_state_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_scope_state_id_state_id_fk" FOREIGN KEY ("scope_state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_scope_org_id_organisation_id_fk') THEN
    ALTER TABLE "me"."indicator_value" ADD CONSTRAINT "indicator_value_scope_org_id_organisation_id_fk" FOREIGN KEY ("scope_org_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_evidence_indicator_value_id_indicator_value_id_fk') THEN
    ALTER TABLE "me"."indicator_value_evidence" ADD CONSTRAINT "indicator_value_evidence_indicator_value_id_indicator_value_id_fk" FOREIGN KEY ("indicator_value_id") REFERENCES "me"."indicator_value"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicator_value_evidence_file_id_file_id_fk') THEN
    ALTER TABLE "me"."indicator_value_evidence" ADD CONSTRAINT "indicator_value_evidence_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "core"."file"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matching_grant_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."matching_grant" ADD CONSTRAINT "matching_grant_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matching_grant_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."matching_grant" ADD CONSTRAINT "matching_grant_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matching_grant_scheme_id_organisation_id_fk') THEN
    ALTER TABLE "me"."matching_grant" ADD CONSTRAINT "matching_grant_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matching_grant_wua_id_wua_id_fk') THEN
    ALTER TABLE "me"."matching_grant" ADD CONSTRAINT "matching_grant_wua_id_wua_id_fk" FOREIGN KEY ("wua_id") REFERENCES "core"."wua"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matching_grant_import_batch_id_import_batch_id_fk') THEN
    ALTER TABLE "me"."matching_grant" ADD CONSTRAINT "matching_grant_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'results_framework_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."results_framework" ADD CONSTRAINT "results_framework_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'results_framework_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."results_framework" ADD CONSTRAINT "results_framework_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scorecard_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."scorecard" ADD CONSTRAINT "scorecard_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scorecard_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."scorecard" ADD CONSTRAINT "scorecard_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scorecard_scheme_id_organisation_id_fk') THEN
    ALTER TABLE "me"."scorecard" ADD CONSTRAINT "scorecard_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scorecard_file_id_file_id_fk') THEN
    ALTER TABLE "me"."scorecard" ADD CONSTRAINT "scorecard_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "core"."file"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."survey" ADD CONSTRAINT "survey_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."survey" ADD CONSTRAINT "survey_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_scheme_id_organisation_id_fk') THEN
    ALTER TABLE "me"."survey" ADD CONSTRAINT "survey_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_answer_response_id_survey_response_id_fk') THEN
    ALTER TABLE "me"."survey_answer" ADD CONSTRAINT "survey_answer_response_id_survey_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "me"."survey_response"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_answer_question_id_survey_question_id_fk') THEN
    ALTER TABLE "me"."survey_answer" ADD CONSTRAINT "survey_answer_question_id_survey_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "me"."survey_question"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_question_survey_id_survey_id_fk') THEN
    ALTER TABLE "me"."survey_question" ADD CONSTRAINT "survey_question_survey_id_survey_id_fk" FOREIGN KEY ("survey_id") REFERENCES "me"."survey"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_submitted_by_app_user_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_approved_by_app_user_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_returned_by_app_user_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_device_id_device_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_import_batch_id_import_batch_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_survey_id_survey_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_survey_id_survey_id_fk" FOREIGN KEY ("survey_id") REFERENCES "me"."survey"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_scheme_id_organisation_id_fk') THEN
    ALTER TABLE "me"."survey_response" ADD CONSTRAINT "survey_response_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_created_by_app_user_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_updated_by_app_user_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_submitted_by_app_user_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_approved_by_app_user_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_returned_by_app_user_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_returned_by_app_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_device_id_device_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_import_batch_id_import_batch_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "core"."import_batch"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_scheme_id_organisation_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_scheme_id_organisation_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "core"."organisation"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_adoption_technology_id_lookup_value_id_fk') THEN
    ALTER TABLE "me"."tech_adoption" ADD CONSTRAINT "tech_adoption_technology_id_lookup_value_id_fk" FOREIGN KEY ("technology_id") REFERENCES "core"."lookup_value"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Disaggregation Normalization Trigger Function
CREATE OR REPLACE FUNCTION "me"."trg_normalize_indicator_value_disaggregation"()
RETURNS TRIGGER AS $$
DECLARE
  v_cleaned jsonb;
BEGIN
  IF NEW.disaggregation IS NULL OR jsonb_typeof(NEW.disaggregation) <> 'object' THEN
    NEW.disaggregation := '{}'::jsonb;
  ELSE
    SELECT COALESCE(
      jsonb_object_agg(elem.key, elem.value ORDER BY elem.key),
      '{}'::jsonb
    )
    INTO v_cleaned
    FROM (
      SELECT key, value
      FROM jsonb_each(NEW.disaggregation)
      WHERE value IS NOT NULL
        AND jsonb_typeof(value) <> 'null'
        AND NOT (jsonb_typeof(value) = 'string' AND value = '""'::jsonb)
    ) elem;

    NEW.disaggregation := v_cleaned;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_normalize_indicator_value_disaggregation" ON "me"."indicator_value";
CREATE TRIGGER "trg_normalize_indicator_value_disaggregation"
BEFORE INSERT OR UPDATE ON "me"."indicator_value"
FOR EACH ROW EXECUTE FUNCTION "me"."trg_normalize_indicator_value_disaggregation"();
--> statement-breakpoint
-- Bump version and updated_at triggers for standard columns in me schema
CREATE OR REPLACE FUNCTION "me"."trg_bump_results_framework_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_results_framework" ON "me"."results_framework";
CREATE TRIGGER "trg_bump_version_results_framework"
BEFORE UPDATE ON "me"."results_framework"
FOR EACH ROW EXECUTE FUNCTION "me"."trg_bump_results_framework_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_indicator" ON "me"."indicator";
CREATE TRIGGER "trg_bump_version_indicator"
BEFORE UPDATE ON "me"."indicator"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_indicator_target" ON "me"."indicator_target";
CREATE TRIGGER "trg_bump_version_indicator_target"
BEFORE UPDATE ON "me"."indicator_target"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_indicator_value" ON "me"."indicator_value";
CREATE TRIGGER "trg_bump_version_indicator_value"
BEFORE UPDATE ON "me"."indicator_value"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_survey" ON "me"."survey";
CREATE TRIGGER "trg_bump_version_survey"
BEFORE UPDATE ON "me"."survey"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_survey_response" ON "me"."survey_response";
CREATE TRIGGER "trg_bump_version_survey_response"
BEFORE UPDATE ON "me"."survey_response"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_scorecard" ON "me"."scorecard";
CREATE TRIGGER "trg_bump_version_scorecard"
BEFORE UPDATE ON "me"."scorecard"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_matching_grant" ON "me"."matching_grant";
CREATE TRIGGER "trg_bump_version_matching_grant"
BEFORE UPDATE ON "me"."matching_grant"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_bump_version_tech_adoption" ON "me"."tech_adoption";
CREATE TRIGGER "trg_bump_version_tech_adoption"
BEFORE UPDATE ON "me"."tech_adoption"
FOR EACH ROW EXECUTE FUNCTION "core"."bump_version_and_updated_at"();
--> statement-breakpoint
-- Update core.trg_slis_change_log to support me syncable tables (survey_response, survey_answer, tech_adoption)
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
    v_record_id := (v_row ->> 'id')::uuid;
    v_op := 'delete';
  ELSIF (TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> 'deleted_at') IS NULL AND (to_jsonb(NEW) ->> 'deleted_at') IS NOT NULL) THEN
    v_row := to_jsonb(NEW);
    v_record_id := (v_row ->> 'id')::uuid;
    v_op := 'delete';
  ELSE
    v_row := to_jsonb(NEW);
    v_record_id := (v_row ->> 'id')::uuid;
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
    WHERE p.id = (CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'plot_id')::uuid ELSE (to_jsonb(NEW) ->> 'plot_id')::uuid END);
  END IF;

  IF v_scheme_id IS NULL AND TG_TABLE_NAME = 'training_attendance' THEN
    SELECT t.scheme_id INTO v_scheme_id
    FROM "slis"."training" t
    WHERE t.id = (CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'training_id')::uuid ELSE (to_jsonb(NEW) ->> 'training_id')::uuid END);
  END IF;

  IF v_scheme_id IS NULL AND TG_TABLE_NAME = 'survey_answer' THEN
    SELECT sr.scheme_id INTO v_scheme_id
    FROM "me"."survey_response" sr
    WHERE sr.id = (CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'response_id')::uuid ELSE (to_jsonb(NEW) ->> 'response_id')::uuid END);
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
DROP TRIGGER IF EXISTS "trg_change_log_survey_response" ON "me"."survey_response";
CREATE TRIGGER "trg_change_log_survey_response"
AFTER INSERT OR UPDATE OR DELETE ON "me"."survey_response"
FOR EACH ROW EXECUTE FUNCTION "core"."trg_slis_change_log"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_change_log_survey_answer" ON "me"."survey_answer";
CREATE TRIGGER "trg_change_log_survey_answer"
AFTER INSERT OR UPDATE OR DELETE ON "me"."survey_answer"
FOR EACH ROW EXECUTE FUNCTION "core"."trg_slis_change_log"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_change_log_tech_adoption" ON "me"."tech_adoption";
CREATE TRIGGER "trg_change_log_tech_adoption"
AFTER INSERT OR UPDATE OR DELETE ON "me"."tech_adoption"
FOR EACH ROW EXECUTE FUNCTION "core"."trg_slis_change_log"();
