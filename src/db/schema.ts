import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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

export const memberTable = pgTable("member", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: text().notNull(),

  // kıdem (seniority) is calculated from this, not stored
  memberLoginDate: date("member_login_date", { mode: "string" }),

  active: boolean().default(true).notNull(),

  logo: text(),
  address: text(),
  phone: text(),
  // a deleted sector leaves its members without one
  sectorId: integer("sector_id").references(() => sectorTable.id, {
    onDelete: "set null",
  }),
  foundingDate: date("founding_date", { mode: "string" }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const authorizedRepresentativeTable = pgTable(
  "authorized_representative",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),

    dateOfBirth: date("date_of_birth", { mode: "string" }),
    phone: text(),
    email: text(),
    notes: text(),

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
    // "member", "representative", "sector", "panel_user", "auth"
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
