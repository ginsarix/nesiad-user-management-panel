import { addDays, format } from "date-fns";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  cashAccountTable,
  collectionTable,
  companyTable,
  counterpartyTable,
  memberTable,
  parameterTable,
  paymentTable,
  projectTable,
  sectorTable,
  smsSendTable,
} from "@/db/schema";
import { ISO_FORMAT, parseIsoDate, todayInIstanbul } from "@/lib/dates";
import { compareTr } from "@/lib/turkish";
import {
  deleteTestCashAccounts,
  insertTestCashAccount,
} from "@/test/cash-accounts";
import { dashboardRoute } from "./dashboard";

// Kasa - Banka fixtures, deleted after the records using them
const cashAccountIds: number[] = [];
let passiveCashAccountId = 0;

// unique per run: sector, parameter and cari names are unique
const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const today = todayInIstanbul();
const tomorrow = format(addDays(parseIsoDate(today) as Date, 1), ISO_FORMAT);
// sms_send has no foreign key; ids far from real ones
const smsContactId = 2_000_000_000 - Math.floor(Math.random() * 1e6);

const ids = {
  members: [] as number[],
  parameters: [] as number[],
  sms: [] as number[],
  sector: 0,
  company: 0,
  project: 0,
  counterparty: 0,
};
const m = { candidate: 0, active: 0, passive: 0, paying: 0 };
const p = { collectionCategory: 0, paymentCategory: 0 };
const sms = {
  foundingFailed: 0,
  birthdayFailed: 0,
  failed: 0,
  sent: 0,
  freshPending: 0,
  stalePending: 0,
};

async function insertMember(values: Partial<typeof memberTable.$inferInsert>) {
  const [row] = await db
    .insert(memberTable)
    .values({ firstName: `__test__ Dashboard ${tag}`, lastName: "", ...values })
    .returning({ id: memberTable.id });
  ids.members.push(row.id);
  return row.id;
}

async function insertParameter(
  kind: (typeof parameterTable.$inferInsert)["kind"],
) {
  const name = `__test__ Dashboard ${kind} ${tag}`;
  const [row] = await db
    .insert(parameterTable)
    .values({ kind, name, nameKey: name.toLocaleLowerCase("tr") })
    .returning({ id: parameterTable.id });
  ids.parameters.push(row.id);
  return row.id;
}

async function insertSms(
  status: (typeof smsSendTable.$inferInsert)["status"],
  offset: number,
  createdAt?: Date,
  row: Partial<typeof smsSendTable.$inferInsert> = {},
) {
  const [inserted] = await db
    .insert(smsSendTable)
    .values({
      kind: "birthday",
      contactId: smsContactId - offset,
      contactName: `__test__ Dashboard SMS ${tag}`,
      celebrationDate: today,
      years: 30,
      phone: "5000000000",
      message: "test",
      status,
      error: status === "failed" ? "test error" : null,
      ...(createdAt ? { createdAt } : {}),
      ...row,
    })
    .returning({ id: smsSendTable.id });
  ids.sms.push(inserted.id);
  return inserted.id;
}

beforeAll(async () => {
  const [sector] = await db
    .insert(sectorTable)
    .values({
      name: `__test__ Dashboard ${tag}`,
      nameKey: `__test__ dashboard ${tag}`,
    })
    .returning({ id: sectorTable.id });
  ids.sector = sector.id;
  const companyTitle = `__test__ Dashboard ${tag}`;
  const [company] = await db
    .insert(companyTable)
    .values({
      title: companyTitle,
      titleKey: companyTitle.toLocaleLowerCase("tr"),
      sectorId: sector.id,
    })
    .returning({ id: companyTable.id });
  ids.company = company.id;

  m.candidate = await insertMember({
    status: "candidate",
    createdAt: new Date("1990-01-01T00:00:00Z"),
  });
  // two Aktif members and a Pasif one of a company in the sector
  // born tomorrow (1984 is a leap year, so 29 Şubat works), no phone
  m.active = await insertMember({
    companyId: company.id,
    birthDate: `1984-${tomorrow.slice(5)}`,
  });
  m.paying = await insertMember({ companyId: company.id });
  m.passive = await insertMember({ status: "passive", companyId: company.id });

  p.collectionCategory = await insertParameter("collection_category");
  p.paymentCategory = await insertParameter("payment_category");
  const cashAccountId = await insertTestCashAccount(
    `__test__ Dashboard ${tag}`,
    cashAccountIds,
  );
  passiveCashAccountId = await insertTestCashAccount(
    `__test__ Dashboard Pasif ${tag}`,
    cashAccountIds,
    { active: false, openingBalance: "999999.00" },
  );

  const [project] = await db
    .insert(projectTable)
    .values({
      name: `__test__ Dashboard ${tag}`,
      number: `__test__ ${tag}`,
      numberKey: `__test__${tag}`,
    })
    .returning({ id: projectTable.id });
  ids.project = project.id;

  await db.insert(collectionTable).values({
    memberId: m.paying,
    categoryId: p.collectionCategory,
    cashAccountId,
    amount: "100.00",
    date: today,
    projectId: project.id,
  });

  const title = `__test__ Dashboard ${tag}`;
  const [counterparty] = await db
    .insert(counterpartyTable)
    .values({ title, titleKey: title.toLocaleLowerCase("tr") })
    .returning({ id: counterpartyTable.id });
  ids.counterparty = counterparty.id;
  await db.insert(paymentTable).values({
    counterpartyId: counterparty.id,
    categoryId: p.paymentCategory,
    cashAccountId,
    amount: "40.50",
    date: today,
  });

  sms.failed = await insertSms("failed", 0);
  // a founding row holds the company id, a birthday row the member id
  sms.foundingFailed = await insertSms("failed", 4, undefined, {
    kind: "founding",
    contactId: company.id,
  });
  sms.birthdayFailed = await insertSms("failed", 5, undefined, {
    contactId: m.active,
  });
  sms.sent = await insertSms("sent", 1);
  sms.freshPending = await insertSms("pending", 2);
  sms.stalePending = await insertSms(
    "pending",
    3,
    new Date(Date.now() - 2 * 60 * 60 * 1000),
  );
});

afterAll(async () => {
  await db
    .delete(collectionTable)
    .where(inArray(collectionTable.memberId, ids.members));
  if (ids.counterparty) {
    await db
      .delete(paymentTable)
      .where(inArray(paymentTable.counterpartyId, [ids.counterparty]));
    await db
      .delete(counterpartyTable)
      .where(inArray(counterpartyTable.id, [ids.counterparty]));
  }
  await db.delete(memberTable).where(inArray(memberTable.id, ids.members));
  if (ids.company) {
    await db
      .delete(companyTable)
      .where(inArray(companyTable.id, [ids.company]));
  }
  if (ids.project) {
    await db
      .delete(projectTable)
      .where(inArray(projectTable.id, [ids.project]));
  }
  if (ids.parameters.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, ids.parameters));
  }
  if (ids.sector) {
    await db.delete(sectorTable).where(inArray(sectorTable.id, [ids.sector]));
  }
  if (ids.sms.length) {
    await db.delete(smsSendTable).where(inArray(smsSendTable.id, ids.sms));
  }
  await deleteTestCashAccounts(cashAccountIds);
});

async function getDashboard() {
  const res = await dashboardRoute.request("/");
  expect(res.status).toBe(200);
  // biome-ignore lint/suspicious/noExplicitAny: test reads a JSON body
  return (await res.json()) as any;
}

/** "-12.50" → -1250n, so amounts compare without floats */
function cents(amount: string) {
  return BigInt(amount.replace(".", ""));
}

describe("GET /api/dashboard", () => {
  it("lists waiting applications, oldest first", async () => {
    const body = await getDashboard();
    const { candidates } = body.attention;
    expect(candidates.count).toBeGreaterThanOrEqual(1);
    expect(candidates.count).toBe(body.memberCounts.candidate);
    expect(candidates.oldest.map((c: { id: number }) => c.id)).toContain(
      m.candidate,
    );
    expect(
      candidates.oldest.find((c: { id: number }) => c.id === m.candidate),
    ).toMatchObject({ name: `__test__ Dashboard ${tag}` });
    const times = candidates.oldest.map((c: { createdAt: string }) =>
      Date.parse(c.createdAt),
    );
    expect(times).toEqual(times.toSorted((a: number, b: number) => a - b));
  });

  it("lists the coming week's celebrations without phone numbers", async () => {
    const body = await getDashboard();
    const { celebrations: listed } = body.attention;
    expect(typeof listed.autoEnabled).toBe("boolean");
    // real members may celebrate too; look at this test's own
    const ours = listed.items.filter(
      (i: { contact: { kind: string; id: number } }) =>
        i.contact.kind === "member" && i.contact.id === m.active,
    );
    expect(ours).toEqual([
      {
        on: tomorrow,
        kind: "birthday",
        contact: {
          kind: "member",
          id: m.active,
          name: `__test__ Dashboard ${tag}`,
          linkMemberId: m.active,
        },
        years: Number(tomorrow.slice(0, 4)) - 1984,
        phoneOk: false,
      },
    ]);
  });

  it("lists failed, unknown and stale pending SMS, not sent or fresh ones", async () => {
    const body = await getDashboard();
    const listed = body.attention.failedSms.map((s: { id: number }) => s.id);
    expect(listed).toContain(sms.failed);
    expect(listed).toContain(sms.stalePending);
    expect(listed).not.toContain(sms.sent);
    expect(listed).not.toContain(sms.freshPending);
  });

  it("failed SMS rows carry the member to link to", async () => {
    const { failedSms } = (await getDashboard()).attention;
    const byId = (id: number) =>
      failedSms.find((s: { id: number }) => s.id === id);
    expect(byId(sms.foundingFailed).linkMemberId).toBe(m.active);
    expect(byId(sms.birthdayFailed).linkMemberId).toBe(m.active);
    // no member has this id
    expect(byId(sms.failed).linkMemberId).toBeNull();
  });

  it("totals this year's money in Postgres, with the difference", async () => {
    const { totals, monthly } = (await getDashboard()).money;
    for (const value of [totals.collected, totals.paid, totals.net]) {
      expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
    expect(cents(totals.net)).toBe(
      cents(totals.collected) - cents(totals.paid),
    );
    expect(cents(totals.collected)).toBeGreaterThanOrEqual(BigInt(10000));
    expect(cents(totals.paid)).toBeGreaterThanOrEqual(BigInt(4050));

    expect(monthly).toHaveLength(12);
    expect(monthly.at(-1).month).toBe(today.slice(0, 7));
    expect(cents(monthly.at(-1).collected)).toBeGreaterThanOrEqual(
      BigInt(10000),
    );
  });

  it("breaks this year's money down by Tür and lists active projects", async () => {
    const { money } = await getDashboard();
    expect(
      money.collectionsByCategory.find(
        (c: { id: number }) => c.id === p.collectionCategory,
      ),
    ).toMatchObject({ count: 1, total: "100.00" });
    expect(
      money.paymentsByCategory.find(
        (c: { id: number }) => c.id === p.paymentCategory,
      ),
    ).toMatchObject({ count: 1, total: "40.50" });
    expect(
      money.activeProjects.find((c: { id: number }) => c.id === ids.project),
    ).toMatchObject({ count: 1, total: "100.00" });
  });

  it("lists at most 5 Aktif cash accounts in Turkish name order", async () => {
    const { count, top } = (await getDashboard()).money.cashAccounts;
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(5);
    expect(count).toBeGreaterThanOrEqual(top.length);
    const names = top.map((a: { name: string }) => a.name);
    expect(names).toEqual([...names].sort(compareTr));
    const listed = top.map((a: { id: number }) => a.id);
    expect(listed).not.toContain(passiveCashAccountId);
    // null when none of the account's periods has started
    for (const a of top) {
      if (a.balance !== null) expect(a.balance).toMatch(/^-?\d+\.\d{2}$/);
    }
    const rows = await db
      .select({ active: cashAccountTable.active })
      .from(cashAccountTable)
      .where(inArray(cashAccountTable.id, listed));
    expect(rows).toHaveLength(listed.length);
    expect(rows.every((row) => row.active)).toBe(true);
  });

  it("lists Aktif members with no tahsilat this year", async () => {
    const { money } = await getDashboard();
    const listed = money.membersWithoutCollection.map(
      (member: { id: number }) => member.id,
    );
    expect(listed).toContain(m.active);
    expect(listed).not.toContain(m.paying);
    expect(listed).not.toContain(m.passive);
    expect(listed).not.toContain(m.candidate);
    expect(
      money.membersWithoutCollection.find(
        (member: { id: number }) => member.id === m.active,
      ),
    ).toEqual({ id: m.active, name: `__test__ Dashboard ${tag}` });
  });

  it("counts Aktif members per sector and summarizes membership", async () => {
    const body = await getDashboard();
    const { membership } = body;
    expect(
      membership.bySector.find((s: { id: number }) => s.id === ids.sector),
    ).toMatchObject({ count: 2 });
    expect(membership.seniority.buckets).toHaveLength(4);
    const seniorityTotal =
      membership.seniority.buckets.reduce(
        (sum: number, b: { count: number }) => sum + b.count,
        0,
      ) + membership.seniority.unknown;
    expect(seniorityTotal).toBeGreaterThanOrEqual(2);
    expect(membership.joinsPerYear).toHaveLength(10);
    expect(membership.joinsPerYear.at(-1).year).toBe(Number(today.slice(0, 4)));
    expect(body.recentAudit.length).toBeLessThanOrEqual(3);
  });
});
