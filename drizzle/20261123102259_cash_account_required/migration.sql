-- Kasa - Banka replaces Ödeme Tipi / Tahsilat Tipi (destructive, approved 2026-11-23).
-- First, so nothing is dropped if it fails: every ödeme and tahsilat needs a
-- Kasa - Banka. Production has none of either; if that ever stops being
-- true this stops the migration instead of guessing an account.
ALTER TABLE "payment" ALTER COLUMN "cash_account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ALTER COLUMN "cash_account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" DROP CONSTRAINT "payment_method_id_parameter_id_fkey";--> statement-breakpoint
ALTER TABLE "collection" DROP CONSTRAINT "collection_method_id_parameter_id_fkey";--> statement-breakpoint
ALTER TABLE "payment" DROP COLUMN "method_id";--> statement-breakpoint
ALTER TABLE "collection" DROP COLUMN "method_id";--> statement-breakpoint
DELETE FROM "parameter" WHERE "kind" IN ('payment_method', 'collection_method');--> statement-breakpoint
ALTER TABLE "parameter" DROP CONSTRAINT "parameter_kind_valid", ADD CONSTRAINT "parameter_kind_valid" CHECK ("kind" IN ('collection_category','payment_category','association_role'));--> statement-breakpoint
-- Saved tahsilat notice templates: {tip} has nothing to fill it any more.
-- The yetkili's texts lose it (account names stay internal); staff texts get {kasa}.
UPDATE "collection_notice_settings" SET
  "representative_sms" = replace(replace("representative_sms", ' ({tip})', ''), '{tip}', ''),
  "representative_email_subject" = replace(replace("representative_email_subject", ' ({tip})', ''), '{tip}', ''),
  "representative_email_body" = replace(replace("representative_email_body", ' ({tip})', ''), '{tip}', ''),
  "staff_sms" = replace(replace("staff_sms", 'Tahsilat Tipi: {tip}', 'Kasa - Banka: {kasa}'), '{tip}', '{kasa}'),
  "staff_email_subject" = replace(replace("staff_email_subject", 'Tahsilat Tipi: {tip}', 'Kasa - Banka: {kasa}'), '{tip}', '{kasa}'),
  "staff_email_body" = replace(replace("staff_email_body", 'Tahsilat Tipi: {tip}', 'Kasa - Banka: {kasa}'), '{tip}', '{kasa}');
