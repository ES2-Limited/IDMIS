DROP INDEX "slis"."farmer_state_id_idx";--> statement-breakpoint
DROP INDEX "slis"."plot_state_id_idx";--> statement-breakpoint
CREATE INDEX "farmer_scheme_status_id_idx" ON "slis"."farmer" USING btree ("scheme_id","status","id");--> statement-breakpoint
CREATE INDEX "farmer_state_status_id_idx" ON "slis"."farmer" USING btree ("state_id","status","id");--> statement-breakpoint
CREATE INDEX "farmer_search_trgm_idx" ON "slis"."farmer" USING gin ("farmer_code" gin_trgm_ops,"first_name" gin_trgm_ops,"last_name" gin_trgm_ops,"phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "plot_scheme_status_id_idx" ON "slis"."plot" USING btree ("scheme_id","status","id");--> statement-breakpoint
CREATE INDEX "plot_state_status_id_idx" ON "slis"."plot" USING btree ("state_id","status","id");--> statement-breakpoint
CREATE INDEX "plot_state_service_type_id_idx" ON "slis"."plot" USING btree ("state_id","service_type","id");--> statement-breakpoint
CREATE INDEX "plot_code_trgm_idx" ON "slis"."plot" USING gin ("plot_code" gin_trgm_ops);