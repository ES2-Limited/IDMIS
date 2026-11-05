-- 0021_blis_map_layer_source_srid.sql
ALTER TABLE "blis"."map_layer" ADD COLUMN IF NOT EXISTS "source_srid" integer;

