import { addDays, format, subYears } from "date-fns";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  authorizedRepresentativeTable,
  collectionTable,
  counterpartyTable,
  memberTable,
  parameterTable,
  paymentTable,
  projectTable,
  sectorTable,
  smsSendTable,
} from "@/db/schema";
import { ISO_FORMAT, parseIsoDate, todayInIstanbul } from "@/lib/dates";
import { dashboardRoute } from "./dashboard";

// unique per run: sector, parameter and cari names are unique
const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const today = todayInIstanbul();
const tomorrow = format(addDays(parseIsoDate(today) as Date, 1), ISO_FORMAT);
// sms_send has no foreign key; ids far from real ones
const smsContactId = 2_000_000_000 - Math.floor(Math.random() * 1e6);

const ids = {
  members: [] as number[],
  representatives: [] as number[],
  parameters: [] as number[],
  sms: [] as number[],
  sector: 0,
  project: 0,
  counterparty: 0,
};
const m = { candidate: 0 };
const r = { active: 0, inactive: 0, paying: 0 };
const p = { collectionCategory: 0, paymentCategory: 0 };
const sms = { failed: 0, sent: 0, freshPending: 0, stalePending: 0 };

async function insertMember(values: Partial<typeof memberTable.$inferInsert>) {
  const [row] = await db
    .insert(memberTable)
    .values({ title: `__test__ Dashboard ${tag}`, ...values })
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
) {
  const [row] = await db
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
    })
    .returning({ id: smsSendTable.id });
  ids.sms.push(row.id);
  return row.id;
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

  m.candidate = await insertMember({
    status: "candidate",
    createdAt: new Date("1990-01-01T00:00:00Z"),
  });
  await insertMember({ sectorId: sector.id });
  await insertMember({ sectorId: sector.id });
  await insertMember({ status: "passive", sectorId: sector.id });

  const birth = format(
    subYears(parseIsoDate(tomorrow) as Date, 40),
    ISO_FORMAT,
  );
  const reps = await db
    .insert(authorizedRepresentativeTable)
    .values([
      { name: `__test__ Dashboard ${tag} A`, dateOfBirth: birth },
      {
        name: `__test__ Dashboard ${tag} B`,
        dateOfBirth: birth,
        active: false,
      },
      { name: `__test__ Dashboard ${tag} C` },
    ])
    .returning({ id: authorizedRepresentativeTable.id });
  ids.representatives.push(...reps.map((rep) => rep.id));
  [r.active, r.inactive, r.paying] = reps.map((rep) => rep.id);

  p.collectionCategory = await insertParameter("collection_category");
  const collectionMethod = await insertParameter("collection_method");
  p.paymentCategory = await insertParameter("payment_category");
  const paymentMethod = await insertParameter("payment_method");

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
    representativeId: r.paying,
    categoryId: p.collectionCategory,
    methodId: collectionMethod,
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
    methodId: paymentMethod,
    amount: "40.50",
    date: today,
  });

  sms.failed = await insertSms("failed", 0);
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
    .where(inArray(collectionTable.representativeId, ids.representatives));
  if (ids.counterparty) {
    await db
      .delete(paymentTable)
      .where(inArray(paymentTable.counterpartyId, [ids.counterparty]));
    await db
      .delete(counterpartyTable)
      .where(inArray(counterpartyTable.id, [ids.counterparty]));
  }
  await db.delete(memberTable).where(inArray(memberTable.id, ids.members));
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
  if (ids.representatives.length) {
    await db
      .delete(authorizedRepresentativeTable)
      .where(inArray(authorizedRepresentativeTable.id, ids.representatives));
  }
  if (ids.sms.length) {
    await db.delete(smsSendTable).where(inArray(smsSendTable.id, ids.sms));
  }
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
    const times = candidates.oldest.map((c: { createdAt: string }) =>
      Date.parse(c.createdAt),
    );
    expect(times).toEqual(times.toSorted((a: number, b: number) => a - b));
  });

  it("lists the coming week's celebrations of active people only", async () => {
    const body = await getDashboard();
    const { celebrations } = body.attention;
    expect(typeof celebrations.autoEnabled).toBe("boolean");
    const ours = celebrations.items.filter(
      (c: { contact: { kind: string; id: number } }) =>
        c.contact.kind === "representative" &&
        (c.contact.id === r.active || c.contact.id === r.inactive),
    );
    expect(ours).toEqual([
      {
        on: tomorrow,
        kind: "birthday",
        contact: {
          kind: "representative",
          id: r.active,
          name: `__test__ Dashboard ${tag} A`,
        },
        years: 40,
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

  it("lists Aktif yetkililer with no tahsilat this year", async () => {
    const { money } = await getDashboard();
    const listed = money.representativesWithoutCollection.map(
      (representative: { id: number }) => representative.id,
    );
    expect(listed).toContain(r.active);
    expect(listed).not.toContain(r.paying);
    expect(listed).not.toContain(r.inactive);
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
