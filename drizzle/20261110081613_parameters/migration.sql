CREATE TABLE "parameter" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parameter_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parameter_kind_name_key_unique" UNIQUE("kind","name_key"),
	CONSTRAINT "parameter_kind_valid" CHECK ("kind" IN ('collection_category','collection_method','payment_category','payment_method'))
);
