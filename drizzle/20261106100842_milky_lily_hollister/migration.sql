ALTER TABLE "member" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE "member" SET "status" = CASE WHEN "active" THEN 'active' ELSE 'passive' END;--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_status_valid" CHECK ("status" IN ('active','passive','candidate','rejected'));
