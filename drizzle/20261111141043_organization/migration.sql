CREATE TABLE "committee_member" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "committee_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"representative_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "committee_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_key" text NOT NULL CONSTRAINT "committee_name_key_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplinary_board_member" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "disciplinary_board_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"representative_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplinary_board" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "disciplinary_board_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_key" text NOT NULL CONSTRAINT "disciplinary_board_name_key_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_board_member" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "management_board_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"representative_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_board" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "management_board_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_key" text NOT NULL CONSTRAINT "management_board_name_key_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervisory_board_member" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supervisory_board_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"representative_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervisory_board" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supervisory_board_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_key" text NOT NULL CONSTRAINT "supervisory_board_name_key_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "committee_member_group_idx" ON "committee_member" ("group_id");--> statement-breakpoint
CREATE INDEX "committee_member_representative_idx" ON "committee_member" ("representative_id");--> statement-breakpoint
CREATE INDEX "committee_member_role_idx" ON "committee_member" ("role_id");--> statement-breakpoint
CREATE INDEX "disciplinary_board_member_group_idx" ON "disciplinary_board_member" ("group_id");--> statement-breakpoint
CREATE INDEX "disciplinary_board_member_representative_idx" ON "disciplinary_board_member" ("representative_id");--> statement-breakpoint
CREATE INDEX "disciplinary_board_member_role_idx" ON "disciplinary_board_member" ("role_id");--> statement-breakpoint
CREATE INDEX "management_board_member_group_idx" ON "management_board_member" ("group_id");--> statement-breakpoint
CREATE INDEX "management_board_member_representative_idx" ON "management_board_member" ("representative_id");--> statement-breakpoint
CREATE INDEX "management_board_member_role_idx" ON "management_board_member" ("role_id");--> statement-breakpoint
CREATE INDEX "supervisory_board_member_group_idx" ON "supervisory_board_member" ("group_id");--> statement-breakpoint
CREATE INDEX "supervisory_board_member_representative_idx" ON "supervisory_board_member" ("representative_id");--> statement-breakpoint
CREATE INDEX "supervisory_board_member_role_idx" ON "supervisory_board_member" ("role_id");--> statement-breakpoint
ALTER TABLE "committee_member" ADD CONSTRAINT "committee_member_group_id_committee_id_fkey" FOREIGN KEY ("group_id") REFERENCES "committee"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "committee_member" ADD CONSTRAINT "committee_member_p5rmqB3xW1Vo_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "committee_member" ADD CONSTRAINT "committee_member_role_id_parameter_id_fkey" FOREIGN KEY ("role_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" ADD CONSTRAINT "disciplinary_board_member_group_id_disciplinary_board_id_fkey" FOREIGN KEY ("group_id") REFERENCES "disciplinary_board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" ADD CONSTRAINT "disciplinary_board_member_smDewAypnqY5_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "disciplinary_board_member" ADD CONSTRAINT "disciplinary_board_member_role_id_parameter_id_fkey" FOREIGN KEY ("role_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "management_board_member" ADD CONSTRAINT "management_board_member_group_id_management_board_id_fkey" FOREIGN KEY ("group_id") REFERENCES "management_board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "management_board_member" ADD CONSTRAINT "management_board_member_U4uqycajnB47_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "management_board_member" ADD CONSTRAINT "management_board_member_role_id_parameter_id_fkey" FOREIGN KEY ("role_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "supervisory_board_member" ADD CONSTRAINT "supervisory_board_member_group_id_supervisory_board_id_fkey" FOREIGN KEY ("group_id") REFERENCES "supervisory_board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supervisory_board_member" ADD CONSTRAINT "supervisory_board_member_VR4jv2rItHHf_fkey" FOREIGN KEY ("representative_id") REFERENCES "authorized_representative"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supervisory_board_member" ADD CONSTRAINT "supervisory_board_member_role_id_parameter_id_fkey" FOREIGN KEY ("role_id") REFERENCES "parameter"("id") ON DELETE RESTRICT;