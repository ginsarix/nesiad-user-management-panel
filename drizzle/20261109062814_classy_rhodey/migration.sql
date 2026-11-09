-- The settings row may already exist, so the new columns are filled with the
-- default texts (DEFAULT_NOTICE_TEMPLATES) before they become required.
ALTER TABLE "application_notice_settings" ADD COLUMN "received_sms" text;--> statement-breakpoint
ALTER TABLE "application_notice_settings" ADD COLUMN "received_email_subject" text;--> statement-breakpoint
ALTER TABLE "application_notice_settings" ADD COLUMN "received_email_body" text;--> statement-breakpoint
UPDATE "application_notice_settings" SET
  "received_sms" = 'Sayın {ad}, {firma} adına yaptığınız NESİAD üyelik başvurunuz alınmıştır. Değerlendirme sonucu size ayrıca bildirilecektir. NESİAD',
  "received_email_subject" = 'NESİAD üyelik başvurunuz alındı',
  "received_email_body" = E'Sayın {ad},\n\n{firma} adına yaptığınız NESİAD üyelik başvurunuz alınmıştır. Başvurunuz değerlendirildikten sonra sonucu size ayrıca bildirilecektir.\n\nNevşehir Sanayici ve İş İnsanları Derneği';--> statement-breakpoint
ALTER TABLE "application_notice_settings" ALTER COLUMN "received_sms" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "application_notice_settings" ALTER COLUMN "received_email_subject" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "application_notice_settings" ALTER COLUMN "received_email_body" SET NOT NULL;
