CREATE TABLE "collection" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collection_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"method_id" integer NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"project_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "collection_date_idx" ON "collection" ("date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "collection_member_idx" ON "collection" ("member_id");--> statement-breakpoint
CREATE INDEX "collection_project_idx" ON "collection" ("project_id");--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_category_id_parameter_id_fkey" FOREIGN KEY ("category_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_method_id_parameter_id_fkey" FOREIGN KEY ("method_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT;