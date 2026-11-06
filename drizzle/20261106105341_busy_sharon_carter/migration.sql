CREATE TABLE "application_notice_settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"accepted_sms" text NOT NULL,
	"rejected_sms" text NOT NULL,
	"accepted_email_subject" text NOT NULL,
	"accepted_email_body" text NOT NULL,
	"rejected_email_subject" text NOT NULL,
	"rejected_email_body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_notice_settings_single_row" CHECK ("id" = 1)
);
