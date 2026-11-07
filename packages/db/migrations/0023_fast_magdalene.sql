ALTER TYPE "core"."import_batch_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ALTER COLUMN "number_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ALTER COLUMN "number_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "slis"."farmer_identity" ALTER COLUMN "number_last4" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "slis"."farm" ADD COLUMN "anonymised" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "slis"."farmer" ADD COLUMN "anonymised" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "slis"."plot" ADD COLUMN "anonymised" boolean DEFAULT false NOT NULL;