CREATE TABLE "cash_account_period" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_account_period_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cash_account_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"opening_balance" numeric(12,2) NOT NULL,
	"carried_from_period_id" integer,
	"carried_amount" numeric(12,2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cash_account_period_account_idx" ON "cash_account_period" ("cash_account_id","start_date");--> statement-breakpoint
ALTER TABLE "cash_account_period" ADD CONSTRAINT "cash_account_period_cash_account_id_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cash_account_period" ADD CONSTRAINT "cash_account_period_di3sqefY1yqp_fkey" FOREIGN KEY ("carried_from_period_id") REFERENCES "cash_account_period"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Every existing account's Başlangıç Bakiyesi becomes its first period's,
-- starting 01.01.2026 (all production finance so far belongs to that period)
INSERT INTO "cash_account_period" ("cash_account_id", "start_date", "opening_balance")
SELECT "id", '2026-01-01', "opening_balance" FROM "cash_account";--> statement-breakpoint
ALTER TABLE "cash_account" DROP COLUMN "opening_balance";
