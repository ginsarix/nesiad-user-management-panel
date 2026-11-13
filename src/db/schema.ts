import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { MemberStatus } from "@/lib/member-status";
import type { ParameterKind } from "@/lib/parameters";

export const sectorTable = pgTable("sector", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  // the name in Turkish lowercase, so "GIDA" and "Gıda" can't both exist
  // (Postgres lower() isn't Turkish-aware: it gives "gida")
  nameKey: text("name_key").notNull().unique(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * The Parametreler lists other than sectors (Tahsilat Türü, Ödeme Tipi…):
 * one table, `kind` says which list an entry is in.
 */
export const parameterTable = pgTable(
  "parameter",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    kind: text().$type<ParameterKind>().notNull(),
    name: text().notNull(),
    // Turkish lowercase name, unique within its list (like sector.name_key)
    nameKey: text("name_key").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("parameter_kind_name_key_unique").on(table.kind, table.nameKey),
    check(
      "parameter_kind_valid",
      sql`${table.kind} IN ('collection_category','collection_method','payment_category','payment_method','association_role')`,
    ),
  ],
);

/** Cariler: the people and businesses the association pays */
export const counterpartyTable = pgTable("counterparty", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  // Ünvan
  title: text().notNull(),
  // Turkish lowercase title, so "İnci" and "İNCİ" can't both exist
  titleKey: text("title_key").notNull().unique(),
  // a province and one of its districts from src/lib/turkey, stored by name
  city: text(),
  district: text(),
  address: text(),
  phone: text(),
  email: text(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Projeler: a project a tahsilat can belong to */
export const projectTable = pgTable("project", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  // Proje Numarası, free text
  number: text().notNull(),
  // the number in Turkish lowercase, so "PR-7" and "pr-7" can't both exist
  numberKey: text("number_key").notNull().unique(),
  active: boolean().default(true).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Taahhütler: what a yetkili pledged to a proje, Adet × Tutar. A record
 * only; totals are computed where shown (src/lib/pledges.ts), never stored.
 */
export const projectPledgeTable = pgTable(
  "project_pledge",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // the rows go with the proje
    projectId: integer("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade" }),
    // a yetkili with taahhütler can't be deleted
    representativeId: integer("representative_id")
      .notNull()
      .references(() => authorizedRepresentativeTable.id, {
        onDelete: "restrict",
      }),
    // Adet
    quantity: integer().notNull(),
    // Tutar, per unit; TL as a string ("1250.50") like every amount
    amount: numeric({ precision: 12, scale: 2, mode: "string" }).notNull(),
    // the order staff entered the rows in
    position: integer().notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("project_pledge_quantity_positive", sql`${table.quantity} >= 1`),
    check("project_pledge_amount_positive", sql`${table.amount} > 0`),
    index("project_pledge_project_idx").on(table.projectId, table.position),
    index("project_pledge_representative_idx").on(table.representativeId),
  ],
);

/**
 * Tahakkuk: one association-wide list of yetkili × Adet × Tutar rows,
 * edited in place on its page. Totals are computed where shown, never stored.
 */
export const accrualTable = pgTable(
  "accrual",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // a yetkili with tahakkuk rows can't be deleted
    representativeId: integer("representative_id")
      .notNull()
      .references(() => authorizedRepresentativeTable.id, {
        onDelete: "restrict",
      }),
    // Adet
    quantity: integer().notNull(),
    // Tutar, per unit; TL as a string ("1250.50") like every amount
    amount: numeric({ precision: 12, scale: 2, mode: "string" }).notNull(),
    // the order staff entered the rows in
    position: integer().notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("accrual_quantity_positive", sql`${table.quantity} >= 1`),
    check("accrual_amount_positive", sql`${table.amount} > 0`),
    index("accrual_position_idx").on(table.position),
    index("accrual_representative_idx").on(table.representativeId),
  ],
);

/** Tahsilatlar: what the association collected from a yetkili */
export const collectionTable = pgTable(
  "collection",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // a yetkili, parameter or proje with tahsilatlar can't be deleted
    representativeId: integer("representative_id")
      .notNull()
      .references(() => authorizedRepresentativeTable.id, {
        onDelete: "restrict",
      }),
    // Tahsilat Türü: a collection_category parameter
    categoryId: integer("category_id")
      .notNull()
      .references(() => parameterTable.id, { onDelete: "restrict" }),
    // Tahsilat Tipi: a collection_method parameter
    methodId: integer("method_id")
      .notNull()
      .references(() => parameterTable.id, { onDelete: "restrict" }),
    // TL; travels as a string ("1250.50") so it never becomes a float
    amount: numeric({ precision: 12, scale: 2, mode: "string" }).notNull(),
    date: date({ mode: "string" }).notNull(),
    note: text(),
    // optional
    projectId: integer("project_id").references(() => projectTable.id, {
      onDelete: "restrict",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("collection_amount_positive", sql`${table.amount} > 0`),
    index("collection_date_idx").on(table.date.desc(), table.id.desc()),
    index("collection_representative_idx").on(table.representativeId),
    index("collection_project_idx").on(table.projectId),
  ],
);

/** Ödemeler: what the association paid to a cari */
export const paymentTable = pgTable(
  "payment",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // a cari or parameter with payments can't be deleted
    counterpartyId: integer("counterparty_id")
      .notNull()
      .references(() => counterpartyTable.id, { onDelete: "restrict" }),
    // TL; travels as a string ("1250.50") so it never becomes a float
    amount: numeric({ precision: 12, scale: 2, mode: "string" }).notNull(),
    date: date({ mode: "string" }).notNull(),
    // Ödeme Türü: a payment_category parameter
    categoryId: integer("category_id")
      .notNull()
      .references(() => parameterTable.id, { onDelete: "restrict" }),
    // Ödeme Tipi: a payment_method parameter
    methodId: integer("method_id")
      .notNull()
      .references(() => parameterTable.id, { onDelete: "restrict" }),
    note: text(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("payment_amount_positive", sql`${table.amount} > 0`),
    index("payment_date_idx").on(table.date.desc(), table.id.desc()),
    index("payment_counterparty_idx").on(table.counterpartyId),
  ],
);

export const memberTable = pgTable(
  "member",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: text().notNull(),

    // kıdem (seniority) is calculated from this, not stored
    memberLoginDate: date("member_login_date", { mode: "string" }),

    status: text().$type<MemberStatus>().default("active").notNull(),

    // the image shown everywhere. A PDF or SVG logo is shown as a PNG the
    // uploader's browser drew from it, and the uploaded file is kept here
    logo: text(),
    logoOriginal: text("logo_original"),
    address: text(),
    phone: text(),
    // a deleted sector leaves its members without one
    sectorId: integer("sector_id").references(() => sectorTable.id, {
      onDelete: "set null",
    }),
    foundingDate: date("founding_date", { mode: "string" }),

    // Applicant details, filled in by the public membership application
    applicantFirstName: text("applicant_first_name"),
    applicantLastName: text("applicant_last_name"),
    applicantRole: text("applicant_role"),
    employeeCount: integer("employee_count"),
    website: text(),
    email: text(),
    mobilePhone: text("mobile_phone"),
    birthDate: date("birth_date", { mode: "string" }),
    birthPlace: text("birth_place"),
    // never returned by the list or detail API, and never written to the audit log
    nationalId: text("national_id"),
    education: text(),
    otherAssociations: text("other_associations"),
    companyIntro: text("company_intro"),
    gender: text().$type<"male" | "female">(),
    referenceName: text("reference_name"),
    identityDocument: text("identity_document"),
    activityDocument: text("activity_document"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),

    // staff-only reason written when rejecting an application; cleared when
    // it is made Aday again, never sent to the applicant
    rejectionNote: text("rejection_note"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "member_status_valid",
      sql`${table.status} IN ('active','passive','candidate','rejected')`,
    ),
  ],
);

export const authorizedRepresentativeTable = pgTable(
  "authorized_representative",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),

    dateOfBirth: date("date_of_birth", { mode: "string" }),
    phone: text(),
    email: text(),
    notes: text(),
    // a JPEG the uploader's browser shrank to 800px; stored like member logos
    photo: text(),

    active: boolean().default(true).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const membersRepresentativesTable = pgTable(
  "members_representatives",
  {
    memberId: integer("member_id")
      .notNull()
      .references(() => memberTable.id, { onDelete: "cascade" }),
    authorizedRepresentativeId: integer("authorized_representative_id")
      .notNull()
      .references(() => authorizedRepresentativeTable.id, {
        onDelete: "cascade",
      }),

    // görev: the yetkili's role at this member, e.g. "Genel Müdür"
    role: text(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.memberId, table.authorizedRepresentativeId] }),
  ],
);

/**
 * One Organizasyon page's tables (src/lib/organizations.ts): its groups
 * (İsim) and the people in each (yetkili + Dernek Görevi). Each page gets
 * its own pair on purpose, since staff may want one handled differently
 * later; to special-case one, replace its call below with explicit tables.
 */
function organizationTables(name: string) {
  const group = pgTable(
    name,
    {
      id: integer().primaryKey().generatedAlwaysAsIdentity(),
      name: text().notNull(),
      // Turkish lowercase name, unique within this page (like sector.name_key)
      nameKey: text("name_key").notNull(),

      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    },
    (table) => [unique(`${name}_name_key_unique`).on(table.nameKey)],
  );

  // no unique (group, yetkili): the same yetkili may hold two görevler
  const person = pgTable(
    `${name}_member`,
    {
      id: integer().primaryKey().generatedAlwaysAsIdentity(),
      groupId: integer("group_id")
        .notNull()
        .references(() => group.id, { onDelete: "cascade" }),
      // deleting a yetkili takes them out of their groups
      representativeId: integer("representative_id")
        .notNull()
        .references(() => authorizedRepresentativeTable.id, {
          onDelete: "cascade",
        }),
      // a Dernek Görevi (association_role parameter); one in use can't be deleted
      roleId: integer("role_id")
        .notNull()
        .references(() => parameterTable.id, { onDelete: "restrict" }),
      // the order staff entered the rows in
      position: integer().notNull(),
    },
    (table) => [
      index(`${name}_member_group_idx`).on(table.groupId),
      index(`${name}_member_representative_idx`).on(table.representativeId),
      index(`${name}_member_role_idx`).on(table.roleId),
    ],
  );

  return { group, person };
}

const managementBoard = organizationTables("management_board");
export const managementBoardTable = managementBoard.group;
export const managementBoardMemberTable = managementBoard.person;

const committee = organizationTables("committee");
export const committeeTable = committee.group;
export const committeeMemberTable = committee.person;

const disciplinaryBoard = organizationTables("disciplinary_board");
export const disciplinaryBoardTable = disciplinaryBoard.group;
export const disciplinaryBoardMemberTable = disciplinaryBoard.person;

const supervisoryBoard = organizationTables("supervisory_board");
export const supervisoryBoardTable = supervisoryBoard.group;
export const supervisoryBoardMemberTable = supervisoryBoard.person;

export const userTable = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  phone: text("phone").notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(true).notNull(),
});

export const sessionTable = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const twoFactorTable = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => [index("twoFactor_userId_idx").on(table.userId)],
);

export const accountTable = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verificationTable = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/** A label and its display-ready value(s), e.g. Telefon: "0384 111" → "0384 222" */
export type AuditChange = { label: string; from: string; to: string };
export type AuditField = { label: string; value: string };

/**
 * Denetim Kayıtları: append-only. The actor is stored as a snapshot with no
 * foreign key, so deleting a panel user keeps their trail.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    // null for the system (seed, scripts) and failed logins
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),

    // e.g. "create", "update", "login_failed"; see src/lib/audit-labels.ts
    action: text().notNull(),
    // "member", "representative", "sector", "parameter", "counterparty",
    // "payment", "project", "collection", "panel_user", "auth"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    // the record's name at the time, e.g. the member's title
    entityLabel: text("entity_label"),

    // field-level changes of an update
    changes: jsonb().$type<AuditChange[]>(),
    // the whole record on create/delete, extra facts on other events
    details: jsonb().$type<AuditField[]>(),

    // logins only
    ip: text(),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt.desc()),
    index("audit_log_actor_idx").on(table.actorId, table.createdAt.desc()),
  ],
);

/** One automatic SMS per person, celebration and day */
export type SmsSendStatus =
  // claimed by a run; stays so if the server stopped before sending
  | "pending"
  | "sent"
  | "failed"
  // NetGSM didn't answer: it may have gone, so it's never retried
  | "unknown";

/**
 * Automatic (celebration) SMS. The unique key is what makes each one go out
 * at most once: a run claims a row before sending, and a later or concurrent
 * run can't claim it again.
 */
export const smsSendTable = pgTable(
  "sms_send",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    kind: text().$type<"founding" | "birthday">().notNull(),
    // member id for "founding", yetkili id for "birthday"; no foreign key, so
    // the log outlives a deleted member
    contactId: integer("contact_id").notNull(),
    contactName: text("contact_name").notNull(),
    // the Istanbul day it's sent for
    celebrationDate: date("celebration_date", { mode: "string" }).notNull(),
    years: integer().notNull(),
    phone: text().notNull(),
    message: text().notNull(),

    status: text().$type<SmsSendStatus>().default("pending").notNull(),
    jobId: text("job_id"),
    error: text(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    unique("sms_send_once").on(
      table.kind,
      table.contactId,
      table.celebrationDate,
    ),
    index("sms_send_celebration_date_idx").on(table.celebrationDate),
  ],
);

/** The one row of automatic SMS settings (Ayarlar page, Bildirimler tab) */
export const smsSettingsTable = pgTable(
  "sms_settings",
  {
    id: integer().primaryKey().default(1),
    // on by default; staff can turn it off from Ayarlar → Bildirimler
    autoEnabled: boolean("auto_enabled").default(true).notNull(),
    // "HH:mm", Istanbul time
    sendTime: text("send_time").default("09:00").notNull(),
    // templates with {ad} and {yil}
    foundingMessage: text("founding_message").notNull(),
    birthdayMessage: text("birthday_message").notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [check("sms_settings_single_row", sql`${table.id} = 1`)],
);

/** The one row of application notice templates (Ayarlar page, Bildirimler tab), {ad} and {firma} */
/** Tahsilat notice templates (Ayarlar page, Bildirimler tab); a single row */
export const collectionNoticeSettingsTable = pgTable(
  "collection_notice_settings",
  {
    id: integer().primaryKey().default(1),
    // to the yetkili the tahsilat is from
    representativeSms: text("representative_sms").notNull(),
    representativeEmailSubject: text("representative_email_subject").notNull(),
    representativeEmailBody: text("representative_email_body").notNull(),
    // to every other active panel user
    staffSms: text("staff_sms").notNull(),
    staffEmailSubject: text("staff_email_subject").notNull(),
    staffEmailBody: text("staff_email_body").notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("collection_notice_settings_single_row", sql`${table.id} = 1`),
  ],
);

export const applicationNoticeSettingsTable = pgTable(
  "application_notice_settings",
  {
    id: integer().primaryKey().default(1),
    receivedSms: text("received_sms").notNull(),
    receivedEmailSubject: text("received_email_subject").notNull(),
    receivedEmailBody: text("received_email_body").notNull(),
    acceptedSms: text("accepted_sms").notNull(),
    rejectedSms: text("rejected_sms").notNull(),
    acceptedEmailSubject: text("accepted_email_subject").notNull(),
    acceptedEmailBody: text("accepted_email_body").notNull(),
    rejectedEmailSubject: text("rejected_email_subject").notNull(),
    rejectedEmailBody: text("rejected_email_body").notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("application_notice_settings_single_row", sql`${table.id} = 1`),
  ],
);
