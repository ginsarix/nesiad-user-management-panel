import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import {
  auditLogTable,
  cashAccountTable,
  collectionTable,
  companyTable,
  memberTable,
  parameterTable,
  paymentTable,
  projectTable,
  sectorTable,
  smsSendTable,
} from "@/db/schema";
import { currentPeriodOf } from "@/lib/cash-account-periods";
import {
  CANDIDATE_LIST_SIZE,
  CELEBRATION_DAYS,
  chartMonths,
  daysBefore,
  FAILED_SMS_DAYS,
  firstCashAccounts,
  joinYears,
  RECENT_AUDIT_SIZE,
  seniorityBuckets,
  yearBounds,
} from "@/lib/dashboard";
import { todayInIstanbul } from "@/lib/dates";
import { MEMBER_STATUSES, type MemberStatus } from "@/lib/member-status";
import { loadCelebrationsBetween } from "@/lib/sms/load-celebrations";
import { getSmsSettings } from "@/lib/sms/settings";
import { compareTr } from "@/lib/turkish";
import { selectPeriodBalances } from "./cash-account-queries";
import { sumOfCollected } from "./collection-queries";
import type { AppEnv } from "./env";
import { memberNameSql } from "./member-rows";
import { sumOfAmounts } from "./payment-queries";

/** Members by status, every status present */
async function memberCounts() {
  const rows = await db
    .select({ status: memberTable.status, count: count() })
    .from(memberTable)
    .groupBy(memberTable.status);
  const counts = Object.fromEntries(
    MEMBER_STATUSES.map((status) => [status, 0]),
  ) as Record<MemberStatus, number>;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

/** The applications waiting longest for a decision, with the applicant's name and company */
function oldestCandidates() {
  return db
    .select({
      id: memberTable.id,
      name: memberNameSql(),
      companyTitle: companyTable.title,
      createdAt: memberTable.createdAt,
    })
    .from(memberTable)
    .leftJoin(companyTable, eq(memberTable.companyId, companyTable.id))
    .where(eq(memberTable.status, "candidate"))
    .orderBy(asc(memberTable.createdAt), asc(memberTable.id))
    .limit(CANDIDATE_LIST_SIZE);
}

/**
 * Automatic SMS of the last FAILED_SMS_DAYS days that didn't go out: failed,
 * unknown, or still pending an hour after the run claimed them (the server
 * stopped mid-send; they're never retried)
 */
function failedSms(today: string) {
  return db
    .select({
      id: smsSendTable.id,
      kind: smsSendTable.kind,
      contactId: smsSendTable.contactId,
      contactName: smsSendTable.contactName,
      celebrationDate: smsSendTable.celebrationDate,
      status: smsSendTable.status,
      error: smsSendTable.error,
      // the member page to link to: a birthday's member (if still there) or
      // a founding company's lowest-id Aktif member
      linkMemberId: sql<number | null>`case ${smsSendTable.kind}
        when 'birthday' then (
          select ${memberTable.id} from ${memberTable}
          where ${memberTable.id} = ${smsSendTable.contactId}
        )
        else (
          select min(${memberTable.id}) from ${memberTable}
          where ${memberTable.companyId} = ${smsSendTable.contactId}
            and ${memberTable.status} = 'active'
        ) end`,
    })
    .from(smsSendTable)
    .where(
      and(
        gte(smsSendTable.celebrationDate, daysBefore(today, FAILED_SMS_DAYS)),
        or(
          inArray(smsSendTable.status, ["failed", "unknown"]),
          and(
            eq(smsSendTable.status, "pending"),
            lt(smsSendTable.createdAt, sql`now() - interval '1 hour'`),
          ),
        ),
      ),
    )
    .orderBy(desc(smsSendTable.celebrationDate), desc(smsSendTable.id));
}

/** This year's tahsilat and ödeme totals and their difference, all summed in Postgres */
async function yearTotals(from: string, to: string) {
  const { rows } = await db.execute<{
    collected: string;
    paid: string;
    net: string;
  }>(sql`
    with c as (
      select coalesce(sum(${collectionTable.amount}), 0) as total
      from ${collectionTable}
      where ${collectionTable.date} between ${from} and ${to}
    ), p as (
      select coalesce(sum(${paymentTable.amount}), 0) as total
      from ${paymentTable}
      where ${paymentTable.date} between ${from} and ${to}
    )
    select
      c.total::numeric(14,2)::text as collected,
      p.total::numeric(14,2)::text as paid,
      (c.total - p.total)::numeric(14,2)::text as net
    from c, p
  `);
  return rows[0];
}

/** Monthly totals from `from` on, keyed "yyyy-MM" */
async function monthlyTotals(from: string, to: string) {
  const collectedMonth = sql<string>`to_char(${collectionTable.date}, 'YYYY-MM')`;
  const paidMonth = sql<string>`to_char(${paymentTable.date}, 'YYYY-MM')`;
  const [collected, paid] = await Promise.all([
    db
      .select({ month: collectedMonth, total: sumOfCollected() })
      .from(collectionTable)
      .where(between(collectionTable.date, from, to))
      .groupBy(collectedMonth),
    db
      .select({ month: paidMonth, total: sumOfAmounts() })
      .from(paymentTable)
      .where(between(paymentTable.date, from, to))
      .groupBy(paidMonth),
  ]);
  return {
    collected: new Map(collected.map((r) => [r.month, r.total])),
    paid: new Map(paid.map((r) => [r.month, r.total])),
  };
}

/** This year's tahsilatlar by Tahsilat Türü, largest first */
function collectionsByCategory(from: string, to: string) {
  const total = sumOfCollected();
  return db
    .select({
      id: parameterTable.id,
      name: parameterTable.name,
      count: count(),
      total,
    })
    .from(collectionTable)
    .innerJoin(
      parameterTable,
      eq(collectionTable.categoryId, parameterTable.id),
    )
    .where(between(collectionTable.date, from, to))
    .groupBy(parameterTable.id)
    .orderBy(
      desc(sql`sum(${collectionTable.amount})`),
      asc(parameterTable.name),
    );
}

/** This year's ödemeler by Ödeme Türü, largest first */
function paymentsByCategory(from: string, to: string) {
  return db
    .select({
      id: parameterTable.id,
      name: parameterTable.name,
      count: count(),
      total: sumOfAmounts(),
    })
    .from(paymentTable)
    .innerJoin(parameterTable, eq(paymentTable.categoryId, parameterTable.id))
    .where(between(paymentTable.date, from, to))
    .groupBy(parameterTable.id)
    .orderBy(desc(sql`sum(${paymentTable.amount})`), asc(parameterTable.name));
}

/** Aktif projeler with everything collected for them, largest first */
function activeProjects() {
  return db
    .select({
      id: projectTable.id,
      name: projectTable.name,
      number: projectTable.number,
      count: count(collectionTable.id),
      total: sumOfCollected(),
    })
    .from(projectTable)
    .leftJoin(collectionTable, eq(collectionTable.projectId, projectTable.id))
    .where(eq(projectTable.active, true))
    .groupBy(projectTable.id)
    .orderBy(
      desc(sql`coalesce(sum(${collectionTable.amount}), 0)`),
      asc(projectTable.name),
    );
}

/** Aktif Kasa - Banka accounts with their current Bakiye; the first few by name */
async function activeCashAccounts() {
  const accounts = await db
    .select({ id: cashAccountTable.id, name: cashAccountTable.name })
    .from(cashAccountTable)
    .where(eq(cashAccountTable.active, true));
  const { count, top } = firstCashAccounts(accounts);
  const periods = await selectPeriodBalances(
    db,
    top.map((account) => account.id),
  );
  const today = todayInIstanbul();
  return {
    count,
    top: top.map((account) => ({
      ...account,
      // the Bakiye of the period today falls in
      balance:
        currentPeriodOf(
          periods.filter((period) => period.cashAccountId === account.id),
          today,
        )?.balance ?? null,
    })),
  };
}

/** Aktif members without a tahsilat dated this year, by name */
async function membersWithoutCollection(from: string, to: string) {
  const members = await db
    .select({ id: memberTable.id, name: memberNameSql() })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.status, "active"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(collectionTable)
            .where(
              and(
                eq(collectionTable.memberId, memberTable.id),
                between(collectionTable.date, from, to),
              ),
            ),
        ),
      ),
    );
  return members.sort((a, b) => compareTr(a.name, b.name));
}

/**
 * Aktif members per sector (their company's), largest first; `id` null for
 * those without one or without a company
 */
async function membersBySector() {
  const rows = await db
    .select({ id: sectorTable.id, name: sectorTable.name, count: count() })
    .from(memberTable)
    .leftJoin(companyTable, eq(memberTable.companyId, companyTable.id))
    .leftJoin(sectorTable, eq(companyTable.sectorId, sectorTable.id))
    .where(eq(memberTable.status, "active"))
    .groupBy(sectorTable.id);
  return rows.sort(
    (a, b) => b.count - a.count || compareTr(a.name ?? "", b.name ?? ""),
  );
}

/** Aktif members' Üye Giriş Tarihi, for the kıdem groups */
async function activeLoginDates() {
  const rows = await db
    .select({ date: memberTable.memberLoginDate })
    .from(memberTable)
    .where(eq(memberTable.status, "active"));
  return rows.map((r) => r.date);
}

/**
 * Current members (Aktif and Pasif) by the year of their Üye Giriş Tarihi,
 * for the last JOIN_YEARS years; members who have since left aren't stored,
 * so this is who joined and is still here
 */
async function joinsPerYear(today: string) {
  const years = joinYears(today);
  const year = sql<number>`extract(year from ${memberTable.memberLoginDate})::int`;
  const rows = await db
    .select({ year, count: count() })
    .from(memberTable)
    .where(
      and(
        inArray(memberTable.status, ["active", "passive"]),
        isNotNull(memberTable.memberLoginDate),
        gte(memberTable.memberLoginDate, `${years[0]}-01-01`),
      ),
    )
    .groupBy(year);
  const counts = new Map(rows.map((r) => [r.year, r.count]));
  return years.map((y) => ({ year: y, count: counts.get(y) ?? 0 }));
}

function recentAudit() {
  return db
    .select({
      id: auditLogTable.id,
      createdAt: auditLogTable.createdAt,
      actorName: auditLogTable.actorName,
      action: auditLogTable.action,
      entityType: auditLogTable.entityType,
      entityLabel: auditLogTable.entityLabel,
    })
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.createdAt), desc(auditLogTable.id))
    .limit(RECENT_AUDIT_SIZE);
}

export const dashboardRoute = new Hono<AppEnv>().get("/", async (c) => {
  const today = todayInIstanbul();
  const { year, from, to } = yearBounds(today);
  const { months, from: chartFrom } = chartMonths(today);

  const [
    statusCounts,
    candidates,
    celebrations,
    smsSettings,
    unsentSms,
    totals,
    monthly,
    byCollectionCategory,
    byPaymentCategory,
    projects,
    cashAccounts,
    withoutCollection,
    bySector,
    loginDates,
    joins,
    audit,
  ] = await Promise.all([
    memberCounts(),
    oldestCandidates(),
    loadCelebrationsBetween(today, CELEBRATION_DAYS),
    getSmsSettings(),
    failedSms(today),
    yearTotals(from, to),
    monthlyTotals(chartFrom, to),
    collectionsByCategory(from, to),
    paymentsByCategory(from, to),
    activeProjects(),
    activeCashAccounts(),
    membersWithoutCollection(from, to),
    membersBySector(),
    activeLoginDates(),
    joinsPerYear(today),
    recentAudit(),
  ]);

  return c.json({
    today,
    year,
    attention: {
      candidates: { count: statusCounts.candidate, oldest: candidates },
      celebrations: {
        autoEnabled: smsSettings.autoEnabled,
        items: celebrations.map((cel) => ({
          on: cel.on,
          kind: cel.kind,
          contact: {
            kind: cel.contact.kind,
            id: cel.contact.id,
            name: cel.contact.name,
            linkMemberId: cel.contact.linkMemberId ?? null,
          },
          years: cel.years,
          phoneOk: cel.phone.ok,
        })),
      },
      failedSms: unsentSms,
    },
    memberCounts: statusCounts,
    money: {
      totals,
      monthly: months.map((month) => ({
        month,
        collected: monthly.collected.get(month) ?? "0.00",
        paid: monthly.paid.get(month) ?? "0.00",
      })),
      collectionsByCategory: byCollectionCategory,
      paymentsByCategory: byPaymentCategory,
      activeProjects: projects,
      cashAccounts,
      membersWithoutCollection: withoutCollection,
    },
    membership: {
      bySector,
      seniority: seniorityBuckets(loginDates, today),
      joinsPerYear: joins,
    },
    recentAudit: audit,
  });
});
