CREATE TABLE "core"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"request_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"state_id" uuid,
	"changes" jsonb,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "core"."outbox_consumption" (
	"event_id" uuid NOT NULL,
	"handler_name" text NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_consumption_event_id_handler_name_pk" PRIMARY KEY("event_id","handler_name")
);
--> statement-breakpoint
CREATE TABLE "core"."outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"dead_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD CONSTRAINT "audit_log_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "core"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD CONSTRAINT "audit_log_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "core"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."outbox_consumption" ADD CONSTRAINT "outbox_consumption_event_id_outbox_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "core"."outbox_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "core"."audit_log" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "core"."audit_log" USING btree ("actor_type","actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "core"."audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_state_idx" ON "core"."audit_log" USING btree ("state_id","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "core"."outbox_event" USING btree ("available_at","occurred_at") WHERE "delivered_at" IS NULL AND "dead_at" IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_event_type_idx" ON "core"."outbox_event" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_dead_idx" ON "core"."outbox_event" USING btree ("dead_at") WHERE "dead_at" IS NOT NULL;