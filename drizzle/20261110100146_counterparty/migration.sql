CREATE TABLE "counterparty" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "counterparty_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"title_key" text NOT NULL UNIQUE,
	"city" text,
	"district" text,
	"address" text,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
