CREATE TABLE "project_pledge" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_pledge_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"representative_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_pledge_quantity_positive" CHECK ("quantity" >= 1),
	CONSTRAINT "project_pledge_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "project_pledge_project_idx" ON "project_pledge" ("project_id","position");--> statement-breakpoint
CREATE INDEX "project_pledge_representative_idx" ON "project_pledge" ("representative_id");--> statement-breakpoint
ALTER TABLE "project_pledge" ADD CONSTRAINT "project_pledge_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_pledge" ADD CONSTRAINT "project_pledge_l52OHdWenEY3_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE RESTRICT;