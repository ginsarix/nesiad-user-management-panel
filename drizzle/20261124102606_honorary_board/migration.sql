CREATE TABLE "honorary_board_member" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "honorary_board_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"representative_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "honorary_board" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "honorary_board_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_key" text NOT NULL CONSTRAINT "honorary_board_name_key_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "honorary_board_member_group_idx" ON "honorary_board_member" ("group_id");--> statement-breakpoint
CREATE INDEX "honorary_board_member_representative_idx" ON "honorary_board_member" ("representative_id");--> statement-breakpoint
CREATE INDEX "honorary_board_member_role_idx" ON "honorary_board_member" ("role_id");--> statement-breakpoint
ALTER TABLE "honorary_board_member" ADD CONSTRAINT "honorary_board_member_group_id_honorary_board_id_fkey" FOREIGN KEY ("group_id") REFERENCES "honorary_board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "honorary_board_member" ADD CONSTRAINT "honorary_board_member_mx437RuDfwmI_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "honorary_board_member" ADD CONSTRAINT "honorary_board_member_role_id_parameter_id_fkey" FOREIGN KEY ("role_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;