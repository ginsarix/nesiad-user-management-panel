CREATE TABLE "accrual" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accrual_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"representative_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accrual_quantity_positive" CHECK ("quantity" >= 1),
	CONSTRAINT "accrual_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "accrual_position_idx" ON "accrual" ("position");--> statement-breakpoint
CREATE INDEX "accrual_representative_idx" ON "accrual" ("representative_id");--> statement-breakpoint
ALTER TABLE "accrual" ADD CONSTRAINT "accrual_representative_id_authorized_representative_id_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE RESTRICT;