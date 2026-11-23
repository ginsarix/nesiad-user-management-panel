CREATE TABLE "cash_account" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_account_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_key" text NOT NULL UNIQUE,
	"opening_balance" numeric(12,2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "cash_account_id" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "cash_account_id" integer;--> statement-breakpoint
CREATE INDEX "collection_cash_account_idx" ON "collection" ("cash_account_id");--> statement-breakpoint
CREATE INDEX "payment_cash_account_idx" ON "payment" ("cash_account_id");--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_cash_account_id_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_cash_account_id_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_account"("id") ON DELETE RESTRICT;