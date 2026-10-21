CREATE TABLE "core"."device" (
	"id" uuid PRIMARY KEY NOT NULL,
	"installation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"platform" text,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"offline_grant_until" timestamp with time zone,
	"last_pull_seq" bigint,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"refresh_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_session_id" uuid,
	"user_agent" text,
	"ip" "inet"
);
--> statement-breakpoint
CREATE TABLE "core"."totp_recovery_code" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."app_user" ADD COLUMN "totp_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."device" ADD CONSTRAINT "device_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."session" ADD CONSTRAINT "session_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "core"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."session" ADD CONSTRAINT "session_replaced_by_session_id_session_id_fk" FOREIGN KEY ("replaced_by_session_id") REFERENCES "core"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."totp_recovery_code" ADD CONSTRAINT "totp_recovery_code_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_user_id_idx" ON "core"."device" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_installation_user_unique" ON "core"."device" USING btree ("installation_id","user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "core"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_family_id_idx" ON "core"."session" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "session_device_id_idx" ON "core"."session" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_refresh_token_hash_unique" ON "core"."session" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "core"."session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "totp_recovery_code_user_id_idx" ON "core"."totp_recovery_code" USING btree ("user_id");