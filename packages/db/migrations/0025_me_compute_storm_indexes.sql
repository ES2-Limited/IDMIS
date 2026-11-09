-- Migration 0025: Consolidated covering indexes for M&E compute storm prevention and list queries
-- Consolidates scheme/state list indexes and compute indexes into unified covering INCLUDE indexes.
-- Drops redundant status-only indexes now covered by the status compute INCLUDE indexes.

-- 1. slis.plot: consolidate scheme, state, and status indexes
DROP INDEX IF EXISTS "slis"."plot_scheme_status_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "slis"."plot_scheme_status_compute_idx";--> statement-breakpoint
CREATE INDEX "plot_scheme_status_id_idx"
  ON "slis"."plot" ("scheme_id", "status", "id")
  INCLUDE ("service_type", "area_ha", "approved_at", "deleted_at");--> statement-breakpoint

DROP INDEX IF EXISTS "slis"."plot_state_status_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "slis"."plot_state_status_compute_idx";--> statement-breakpoint
CREATE INDEX "plot_state_status_id_idx"
  ON "slis"."plot" ("state_id", "status", "id")
  INCLUDE ("service_type", "area_ha", "approved_at", "deleted_at");--> statement-breakpoint

DROP INDEX IF EXISTS "slis"."plot_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "slis"."plot_status_compute_idx";--> statement-breakpoint
CREATE INDEX "plot_status_compute_idx"
  ON "slis"."plot" ("status")
  INCLUDE ("service_type", "area_ha", "approved_at", "deleted_at");--> statement-breakpoint

-- 2. slis.farmer: consolidate scheme, state, and status indexes
DROP INDEX IF EXISTS "slis"."farmer_scheme_status_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "slis"."farmer_scheme_status_compute_idx";--> statement-breakpoint
CREATE INDEX "farmer_scheme_status_id_idx"
  ON "slis"."farmer" ("scheme_id", "status", "id")
  INCLUDE ("gender", "approved_at", "deleted_at");--> statement-breakpoint

DROP INDEX IF EXISTS "slis"."farmer_state_status_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "slis"."farmer_state_status_compute_idx";--> statement-breakpoint
CREATE INDEX "farmer_state_status_id_idx"
  ON "slis"."farmer" ("state_id", "status", "id")
  INCLUDE ("gender", "approved_at", "deleted_at");--> statement-breakpoint

DROP INDEX IF EXISTS "slis"."farmer_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "slis"."farmer_status_compute_idx";--> statement-breakpoint
CREATE INDEX "farmer_status_compute_idx"
  ON "slis"."farmer" ("status")
  INCLUDE ("gender", "approved_at", "deleted_at");
