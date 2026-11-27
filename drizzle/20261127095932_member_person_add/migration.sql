CREATE TABLE "company" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "company_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"title_key" text NOT NULL,
	"logo" text,
	"logo_original" text,
	"address" text,
	"phone" text,
	"website" text,
	"company_intro" text,
	"activity_document" text,
	"sector_id" integer,
	"founding_date" date,
	"employee_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "representative_member_map" (
	"representative_id" integer PRIMARY KEY,
	"member_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member" RENAME COLUMN "applicant_first_name" TO "first_name";--> statement-breakpoint
ALTER TABLE "member" RENAME COLUMN "applicant_last_name" TO "last_name";--> statement-breakpoint
ALTER TABLE "member" RENAME COLUMN "applicant_role" TO "company_role";--> statement-breakpoint
ALTER TABLE "accrual" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "committee_member" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "honorary_board_member" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "management_board_member" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "photo" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "po_positive_card_no" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "project_pledge" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "supervisory_board_member" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "company_title_key_idx" ON "company" ("title_key");--> statement-breakpoint
CREATE INDEX "member_company_idx" ON "member" ("company_id");--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_sector_id_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sector"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_company_id_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "representative_member_map" ADD CONSTRAINT "representative_member_map_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;