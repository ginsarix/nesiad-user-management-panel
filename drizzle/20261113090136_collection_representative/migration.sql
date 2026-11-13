ALTER TABLE "collection" DROP CONSTRAINT "collection_member_id_member_id_fkey";--> statement-breakpoint
ALTER TABLE "collection_notice_settings" RENAME COLUMN "member_sms" TO "representative_sms";--> statement-breakpoint
ALTER TABLE "collection_notice_settings" RENAME COLUMN "member_email_subject" TO "representative_email_subject";--> statement-breakpoint
ALTER TABLE "collection_notice_settings" RENAME COLUMN "member_email_body" TO "representative_email_body";--> statement-breakpoint
DROP INDEX "collection_member_idx";--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "representative_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" DROP COLUMN "member_id";--> statement-breakpoint
CREATE INDEX "collection_representative_idx" ON "collection" ("representative_id");--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_representative_id_authorized_representative_id_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE RESTRICT;--> statement-breakpoint
-- Tahsilat notices now name the yetkili: saved templates move from {uye} to {yetkili}
UPDATE "collection_notice_settings" SET
  "representative_sms" = replace("representative_sms", '{uye}', '{yetkili}'),
  "representative_email_subject" = replace("representative_email_subject", '{uye}', '{yetkili}'),
  "representative_email_body" = replace("representative_email_body", '{uye}', '{yetkili}'),
  "staff_sms" = replace("staff_sms", '{uye}', '{yetkili}'),
  "staff_email_subject" = replace("staff_email_subject", '{uye}', '{yetkili}'),
  "staff_email_body" = replace(replace("staff_email_body", 'Üye: {uye}', 'Yetkili: {yetkili}'), '{uye}', '{yetkili}');
