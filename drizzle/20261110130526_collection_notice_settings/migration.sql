CREATE TABLE "collection_notice_settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"member_sms" text NOT NULL,
	"member_email_subject" text NOT NULL,
	"member_email_body" text NOT NULL,
	"staff_sms" text NOT NULL,
	"staff_email_subject" text NOT NULL,
	"staff_email_body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_notice_settings_single_row" CHECK ("id" = 1)
);
