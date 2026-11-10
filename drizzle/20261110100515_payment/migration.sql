CREATE TABLE "payment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"counterparty_id" integer NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"date" date NOT NULL,
	"category_id" integer NOT NULL,
	"method_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "payment_date_idx" ON "payment" ("date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payment_counterparty_idx" ON "payment" ("counterparty_id");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_category_id_parameter_id_fkey" FOREIGN KEY ("category_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_method_id_parameter_id_fkey" FOREIGN KEY ("method_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;