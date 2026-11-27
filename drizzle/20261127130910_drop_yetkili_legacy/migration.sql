ALTER TABLE "member" DROP CONSTRAINT "member_sector_id_sector_id_fkey";--> statement-breakpoint
ALTER TABLE "members_representatives" DROP CONSTRAINT "members_representatives_jS7XE7ufS0nK_fkey";--> statement-breakpoint
DROP TABLE "authorized_representative";--> statement-breakpoint
DROP TABLE "members_representatives";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "logo";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "sector_id";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "founding_date";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "employee_count";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "website";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "company_intro";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "activity_document";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "logo_original";