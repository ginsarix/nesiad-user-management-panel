ALTER TABLE "accrual" DROP CONSTRAINT "accrual_representative_id_authorized_representative_id_fkey";--> statement-breakpoint
ALTER TABLE "collection" DROP CONSTRAINT "collection_representative_id_authorized_representative_id_fkey";--> statement-breakpoint
ALTER TABLE "committee_member" DROP CONSTRAINT "committee_member_p5rmqB3xW1Vo_fkey";--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" DROP CONSTRAINT "disciplinary_board_member_smDewAypnqY5_fkey";--> statement-breakpoint
ALTER TABLE "honorary_board_member" DROP CONSTRAINT "honorary_board_member_mx437RuDfwmI_fkey";--> statement-breakpoint
ALTER TABLE "management_board_member" DROP CONSTRAINT "management_board_member_U4uqycajnB47_fkey";--> statement-breakpoint
ALTER TABLE "project_pledge" DROP CONSTRAINT "project_pledge_l52OHdWenEY3_fkey";--> statement-breakpoint
ALTER TABLE "supervisory_board_member" DROP CONSTRAINT "supervisory_board_member_VR4jv2rItHHf_fkey";--> statement-breakpoint
DROP INDEX "accrual_representative_idx";--> statement-breakpoint
DROP INDEX "collection_representative_idx";--> statement-breakpoint
DROP INDEX "committee_member_representative_idx";--> statement-breakpoint
DROP INDEX "disciplinary_board_member_representative_idx";--> statement-breakpoint
DROP INDEX "honorary_board_member_representative_idx";--> statement-breakpoint
DROP INDEX "management_board_member_representative_idx";--> statement-breakpoint
DROP INDEX "project_pledge_representative_idx";--> statement-breakpoint
DROP INDEX "supervisory_board_member_representative_idx";--> statement-breakpoint
ALTER TABLE "committee_member" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "management_board_member" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "supervisory_board_member" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "collection" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "project_pledge" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "accrual" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "honorary_board_member" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "last_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accrual" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "committee_member" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "honorary_board_member" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "management_board_member" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_pledge" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supervisory_board_member" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "accrual_member_idx" ON "accrual" ("member_id");--> statement-breakpoint
CREATE INDEX "collection_member_idx" ON "collection" ("member_id");--> statement-breakpoint
CREATE INDEX "committee_member_member_idx" ON "committee_member" ("member_id");--> statement-breakpoint
CREATE INDEX "disciplinary_board_member_member_idx" ON "disciplinary_board_member" ("member_id");--> statement-breakpoint
CREATE INDEX "honorary_board_member_member_idx" ON "honorary_board_member" ("member_id");--> statement-breakpoint
CREATE INDEX "management_board_member_member_idx" ON "management_board_member" ("member_id");--> statement-breakpoint
CREATE INDEX "project_pledge_member_idx" ON "project_pledge" ("member_id");--> statement-breakpoint
CREATE INDEX "supervisory_board_member_member_idx" ON "supervisory_board_member" ("member_id");--> statement-breakpoint
ALTER TABLE "accrual" ADD CONSTRAINT "accrual_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "committee_member" ADD CONSTRAINT "committee_member_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" ADD CONSTRAINT "disciplinary_board_member_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "honorary_board_member" ADD CONSTRAINT "honorary_board_member_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "management_board_member" ADD CONSTRAINT "management_board_member_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_pledge" ADD CONSTRAINT "project_pledge_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "supervisory_board_member" ADD CONSTRAINT "supervisory_board_member_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;