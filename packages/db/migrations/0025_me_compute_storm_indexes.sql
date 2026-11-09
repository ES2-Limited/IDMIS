-- Migration 0025: Covering indexes for M&E compute storm prevention
-- Covers scheme, state and national level aggregate queries on slis.plot and slis.farmer

CREATE INDEX IF NOT EXISTS "plot_scheme_status_compute_idx"
  ON "slis"."plot" ("scheme_id", "status")
  INCLUDE ("service_type", "area_ha", "approved_at", "deleted_at");

CREATE INDEX IF NOT EXISTS "plot_state_status_compute_idx"
  ON "slis"."plot" ("state_id", "status")
  INCLUDE ("service_type", "area_ha", "approved_at", "deleted_at");

CREATE INDEX IF NOT EXISTS "plot_status_compute_idx"
  ON "slis"."plot" ("status")
  INCLUDE ("service_type", "area_ha", "approved_at", "deleted_at");

CREATE INDEX IF NOT EXISTS "farmer_scheme_status_compute_idx"
  ON "slis"."farmer" ("scheme_id", "status")
  INCLUDE ("gender", "approved_at", "deleted_at");

CREATE INDEX IF NOT EXISTS "farmer_state_status_compute_idx"
  ON "slis"."farmer" ("state_id", "status")
  INCLUDE ("gender", "approved_at", "deleted_at");

CREATE INDEX IF NOT EXISTS "farmer_status_compute_idx"
  ON "slis"."farmer" ("status")
  INCLUDE ("gender", "approved_at", "deleted_at");
