import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  cashAccountPeriodTable,
  cashAccountTable,
  collectionTable,
  counterpartyTable,
  memberTable,
  parameterTable,
  paymentTable,
} from "@/db/schema";
import { deleteTestCashAccounts } from "@/test/cash-accounts";
import { cashAccountsRoute } from "./cash-accounts";

const suffix = crypto.randomUUID().slice(0, 8);
const accountIds: number[] = [];
const paymentIds: number[] = [];
const collectionIds: number[] = [];
const parameterIds: number[] = [];

let cari: number;
let uye: number;
let paymentCategory: number;
let collectionCategory: number;

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function insertParameter(kind: string, name: string) {
  const [row] = await db
    .insert(parameterTable)
    .values({
      kind: kind as "payment_category",
      name,
      nameKey: name.toLocaleLowerCase("tr"),
    })
    .returning({ id: parameterTable.id });
  parameterIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  const title = `__test__ Kasa cari ${suffix}`;
  const [counterparty] = await db
    .insert(counterpartyTable)
    .values({ title, titleKey: title.toLocaleLowerCase("tr") })
    .returning({ id: counterpartyTable.id });
  cari = counterparty.id;
  const [member] = await db
    .insert(memberTable)
    .values({ firstName: "__test__ Kasa üye", lastName: suffix })
    .returning({ id: memberTable.id });
  uye = member.id;
  paymentCategory = await insertParameter(
    "payment_category",
    `__test__ Kasa ÖT ${suffix}`,
  );
  collectionCategory = await insertParameter(
    "collection_category",
    `__test__ Kasa TT ${suffix}`,
  );
});

afterAll(async () => {
  if (paymentIds.length) {
    await db.delete(paymentTable).where(inArray(paymentTable.id, paymentIds));
  }
  if (collectionIds.length) {
    await db
      .delete(collectionTable)
      .where(inArray(collectionTable.id, collectionIds));
  }
  await deleteTestCashAccounts(accountIds);
  await db.delete(counterpartyTable).where(eq(counterpartyTable.id, cari));
  await db.delete(memberTable).where(eq(memberTable.id, uye));
  await db
    .delete(parameterTable)
    .where(inArray(parameterTable.id, parameterIds));
});

async function addPayment(
  cashAccountId: number,
  amount: string,
  date = "2026-11-01",
) {
  const [row] = await db
    .insert(paymentTable)
    .values({
      counterpartyId: cari,
      amount,
      date,
      categoryId: paymentCategory,
      cashAccountId,
    })
    .returning({ id: paymentTable.id });
  paymentIds.push(row.id);
  return row.id;
}

async function addCollection(
  cashAccountId: number,
  amount: string,
  date = "2026-11-01",
) {
  const [row] = await db
    .insert(collectionTable)
    .values({
      memberId: uye,
      amount,
      date,
      categoryId: collectionCategory,
      cashAccountId,
    })
    .returning({ id: collectionTable.id });
  collectionIds.push(row.id);
  return row.id;
}

type PeriodInput = { startDate: string; openingBalance: string };

const ONE_PERIOD: PeriodInput[] = [
  { startDate: "2026-01-01", openingBalance: "0.00" },
];

async function create(values: Record<string, unknown>) {
  const res = await cashAccountsRoute.request(
    "/",
    json("POST", { active: true, periods: ONE_PERIOD, ...values }),
  );
  const body = await res.json();
  if (res.status === 201) accountIds.push(body.id);
  return { res, body };
}

type Period = {
  id: number;
  startDate: string;
  endDate: string | null;
  openingBalance: string;
  collected: string;
  paid: string;
  balance: string;
  carriedFromPeriodId: number | null;
  carriedAmount: string | null;
  sourceBalance: string | null;
};

type Account = {
  id: number;
  name: string;
  active: boolean;
  balance: string | null;
  paymentCount: number;
  collectionCount: number;
  currentPeriodId: number | null;
  periods: Period[];
  outside: {
    before: string | null;
    collectionCount: number;
    paymentCount: number;
  };
};

type ListItem = {
  id: number;
  balance: string | null;
  currentPeriodStart: string | null;
  paymentCount: number;
  collectionCount: number;
  periods: { id: number; startDate: string; balance: string }[];
};

async function get(id: number) {
  const res = await cashAccountsRoute.request(`/${id}`);
  return { res, body: (await res.json()) as Account };
}

async function listItem(id: number) {
  const res = await cashAccountsRoute.request("/");
  const list = (await res.json()) as ListItem[];
  return list.find((a) => a.id === id);
}

async function latestAudit(id: number, action: string) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "cash_account"),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

describe("POST /api/cash-accounts", () => {
  it("creates with its periods and records them", async () => {
    const { res, body } = await create({
      name: ` __test__ Merkez Kasa ${suffix} `,
      periods: [
        { startDate: "2026-01-01", openingBalance: "-50.00" },
        { startDate: "2025-01-01", openingBalance: "1250.50" },
      ],
    });
    expect(res.status).toBe(201);
    expect(body.message).toBe("Kasa - Banka kaydedildi");

    const { body: account } = await get(body.id);
    expect(account).toMatchObject({
      name: `__test__ Merkez Kasa ${suffix}`,
      balance: "-50.00",
      active: true,
      paymentCount: 0,
      collectionCount: 0,
    });
    expect(account.periods.map((p) => [p.startDate, p.openingBalance])).toEqual(
      [
        ["2025-01-01", "1250.50"],
        ["2026-01-01", "-50.00"],
      ],
    );

    const audit = await latestAudit(body.id, "create");
    expect(audit.details).toEqual([
      { label: "İsim", value: `__test__ Merkez Kasa ${suffix}` },
      { label: "Durum", value: "Aktif" },
      {
        label: "Dönemler",
        value: "01.01.2025: 1.250,50 TL; 01.01.2026: -50,00 TL",
      },
    ]);
  });

  it("refuses an account without periods", async () => {
    const { res, body } = await create({
      name: `__test__ Dönemsiz ${suffix}`,
      periods: [],
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("En az bir dönem olmalı");
  });

  it("refuses two periods with the same start date", async () => {
    const { res, body } = await create({
      name: `__test__ Çift ${suffix}`,
      periods: [
        { startDate: "2026-01-01", openingBalance: "0.00" },
        { startDate: "2026-01-01", openingBalance: "5.00" },
      ],
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Aynı başlangıç tarihli iki dönem olamaz");
  });

  it("allows a period starting in the future", async () => {
    const { res } = await create({
      name: `__test__ Gelecek ${suffix}`,
      periods: [{ startDate: "2999-01-01", openingBalance: "0.00" }],
    });
    expect(res.status).toBe(201);
  });

  it("refuses a malformed opening balance", async () => {
    const { res, body } = await create({
      name: `__test__ Bozuk ${suffix}`,
      periods: [{ startDate: "2026-01-01", openingBalance: "1.250,00" }],
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Geçerli bir tutar girin");
  });

  it("refuses a blank name", async () => {
    const { res, body } = await create({ name: "  " });
    expect(res.status).toBe(400);
    expect(body.error).toBe("İsim boş olamaz");
  });

  it("keeps names unique ignoring Turkish case", async () => {
    await create({ name: `__test__ İş Bankası ${suffix}` });
    const { res, body } = await create({
      name: `__test__ iş bankası ${suffix}`,
    });
    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Bu isimde bir Kasa - Banka zaten var",
      field: "name",
    });
  });
});

describe("Bakiye", () => {
  it("adds tahsilatlar and subtracts ödemeler, several of each", async () => {
    const { body } = await create({
      name: `__test__ Ziraat ${suffix}`,
      periods: [{ startDate: "2026-01-01", openingBalance: "1000.00" }],
    });
    await addCollection(body.id, "200.00");
    await addCollection(body.id, "300.50");
    await addPayment(body.id, "100.25");
    await addPayment(body.id, "50.00");
    await addPayment(body.id, "25.00");

    const { body: account } = await get(body.id);
    expect(account).toMatchObject({
      balance: "1325.25",
      paymentCount: 3,
      collectionCount: 2,
    });
    expect(await listItem(body.id)).toMatchObject({
      balance: "1325.25",
      paymentCount: 3,
      collectionCount: 2,
    });
  });

  it("ignores other accounts' records", async () => {
    const { body: a } = await create({ name: `__test__ A ${suffix}` });
    const { body: b } = await create({ name: `__test__ B ${suffix}` });
    await addPayment(b.id, "75.00");
    await addCollection(b.id, "10.00");
    expect((await get(a.id)).body.balance).toBe("0.00");
    expect((await get(b.id)).body.balance).toBe("-65.00");
  });

  it("counts records in the period their date falls in", async () => {
    const { body } = await create({
      name: `__test__ Dönemli ${suffix}`,
      periods: [
        { startDate: "2025-01-01", openingBalance: "100.00" },
        { startDate: "2026-01-01", openingBalance: "1000.00" },
      ],
    });
    await addCollection(body.id, "50.00", "2025-12-31");
    await addCollection(body.id, "30.00", "2026-01-01");
    await addPayment(body.id, "10.00", "2026-06-01");
    await addCollection(body.id, "999.00", "2024-12-31");

    const { body: account } = await get(body.id);
    const [first, second] = account.periods;
    expect(first).toMatchObject({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      collected: "50.00",
      paid: "0.00",
      balance: "150.00",
    });
    expect(second).toMatchObject({
      startDate: "2026-01-01",
      endDate: null,
      collected: "30.00",
      paid: "10.00",
      balance: "1020.00",
    });
    expect(account.balance).toBe("1020.00");
    expect(account.currentPeriodId).toBe(second.id);
    expect(account.outside).toEqual({
      before: "2025-01-01",
      collectionCount: 1,
      paymentCount: 0,
    });

    const item = await listItem(body.id);
    expect(item).toMatchObject({
      balance: "1020.00",
      currentPeriodStart: "2026-01-01",
    });
    expect(item?.periods).toEqual([
      { id: first.id, startDate: "2025-01-01", balance: "150.00" },
      { id: second.id, startDate: "2026-01-01", balance: "1020.00" },
    ]);
  });

  it("moves a record between periods with its date", async () => {
    const { body } = await create({
      name: `__test__ Taşınan ${suffix}`,
      periods: [
        { startDate: "2025-01-01", openingBalance: "100.00" },
        { startDate: "2026-01-01", openingBalance: "1000.00" },
      ],
    });
    const id = await addCollection(body.id, "50.00", "2025-12-31");
    expect((await get(body.id)).body.periods[0].balance).toBe("150.00");

    await db
      .update(collectionTable)
      .set({ date: "2026-02-01" })
      .where(eq(collectionTable.id, id));
    const { body: account } = await get(body.id);
    expect(account.periods.map((p) => p.balance)).toEqual([
      "100.00",
      "1050.00",
    ]);
  });

  it("has no current Bakiye while every period is in the future", async () => {
    const { body } = await create({
      name: `__test__ Başlamamış ${suffix}`,
      periods: [{ startDate: "2999-01-01", openingBalance: "5.00" }],
    });
    const { body: account } = await get(body.id);
    expect(account.balance).toBeNull();
    expect(account.currentPeriodId).toBeNull();
    expect(await listItem(body.id)).toMatchObject({
      balance: null,
      currentPeriodStart: null,
    });
  });

  it("an account without periods has no Bakiye", async () => {
    const name = `__test__ Boş ${suffix}`;
    const [row] = await db
      .insert(cashAccountTable)
      .values({ name, nameKey: name.toLocaleLowerCase("tr") })
      .returning({ id: cashAccountTable.id });
    accountIds.push(row.id);
    await addCollection(row.id, "5.00");

    const { res, body: account } = await get(row.id);
    expect(res.status).toBe(200);
    expect(account).toMatchObject({
      balance: null,
      currentPeriodId: null,
      periods: [],
      outside: { before: null, collectionCount: 0, paymentCount: 0 },
    });
    expect((await listItem(row.id))?.balance).toBeNull();
  });
});

describe("PATCH /api/cash-accounts/:id", () => {
  it("audits the changed fields only", async () => {
    const name = `__test__ Vakıf ${suffix}`;
    const { body } = await create({ name });

    const res = await cashAccountsRoute.request(
      `/${body.id}`,
      json("PATCH", { name, active: false }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Kasa - Banka güncellendi");

    const audit = await latestAudit(body.id, "update");
    expect(audit.changes).toEqual([
      { label: "Durum", from: "Aktif", to: "Pasif" },
    ]);
    expect((await get(body.id)).body).toMatchObject({ active: false });

    // the same values again write nothing
    await cashAccountsRoute.request(
      `/${body.id}`,
      json("PATCH", { name, active: false }),
    );
    expect((await latestAudit(body.id, "update")).id).toBe(audit.id);
  });

  it("refuses a name another account has", async () => {
    await create({ name: `__test__ Halk ${suffix}` });
    const { body } = await create({ name: `__test__ Halk 2 ${suffix}` });
    const res = await cashAccountsRoute.request(
      `/${body.id}`,
      json("PATCH", { name: `__test__ HALK ${suffix}`, active: true }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe("name");
  });
});

describe("PATCH /api/cash-accounts/:id periods", () => {
  async function twoPeriods(name: string) {
    const { body } = await create({
      name: `${name} ${suffix}`,
      periods: [
        { startDate: "2025-01-01", openingBalance: "100.00" },
        { startDate: "2026-01-01", openingBalance: "0.00" },
      ],
    });
    const [a, b] = (await get(body.id)).body.periods;
    return { id: body.id as number, name: `${name} ${suffix}`, a, b };
  }

  async function patch(id: number, values: Record<string, unknown>) {
    return await cashAccountsRoute.request(`/${id}`, json("PATCH", values));
  }

  async function linkPeriods(toId: number, fromId: number, amount: string) {
    await db
      .update(cashAccountPeriodTable)
      .set({ carriedFromPeriodId: fromId, carriedAmount: amount })
      .where(eq(cashAccountPeriodTable.id, toId));
  }

  it("PATCH without periods leaves them alone", async () => {
    const { id, name, a, b } = await twoPeriods("__test__ Dokunma");
    expect((await patch(id, { name, active: false })).status).toBe(200);
    const { body } = await get(id);
    expect(body.periods.map((p) => p.id)).toEqual([a.id, b.id]);
    expect((await latestAudit(id, "update")).changes).toEqual([
      { label: "Durum", from: "Aktif", to: "Pasif" },
    ]);
  });

  it("replaces periods: updates kept ids, inserts new, deletes missing", async () => {
    const { id, name, a } = await twoPeriods("__test__ Değişen");
    const res = await patch(id, {
      name,
      active: true,
      periods: [
        { id: a.id, startDate: "2025-01-01", openingBalance: "200.00" },
        { startDate: "2027-01-01", openingBalance: "5.00" },
      ],
    });
    expect(res.status).toBe(200);

    const { body } = await get(id);
    expect(body.periods.map((p) => [p.startDate, p.openingBalance])).toEqual([
      ["2025-01-01", "200.00"],
      ["2027-01-01", "5.00"],
    ]);
    expect(body.periods[0].id).toBe(a.id);
    expect((await latestAudit(id, "update")).changes).toEqual([
      {
        label: "Dönemler",
        from: "01.01.2025: 100,00 TL; 01.01.2026: 0,00 TL",
        to: "01.01.2025: 200,00 TL; 01.01.2027: 5,00 TL",
      },
    ]);
  });

  it("swaps two periods' start dates", async () => {
    const { id, name, a, b } = await twoPeriods("__test__ Takas");
    const res = await patch(id, {
      name,
      active: true,
      periods: [
        { id: a.id, startDate: "2026-01-01", openingBalance: "100.00" },
        { id: b.id, startDate: "2025-01-01", openingBalance: "0.00" },
      ],
    });
    expect(res.status).toBe(200);
    const { body } = await get(id);
    expect(body.periods.map((p) => [p.id, p.startDate])).toEqual([
      [b.id, "2025-01-01"],
      [a.id, "2026-01-01"],
    ]);
  });

  it("refuses a period of another account", async () => {
    const { id, name, a } = await twoPeriods("__test__ Kendi");
    const other = await twoPeriods("__test__ Başkası");
    const res = await patch(id, {
      name,
      active: true,
      periods: [
        { id: a.id, startDate: "2025-01-01", openingBalance: "1.00" },
        { id: other.b.id, startDate: "2026-01-01", openingBalance: "1.00" },
      ],
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Dönem bulunamadı",
      field: "periods",
    });
    expect((await get(id)).body.periods[0].openingBalance).toBe("100.00");
    expect((await get(other.id)).body.periods).toHaveLength(2);
  });

  it("a hand-typed opening balance drops the devir link", async () => {
    const { id, name, a, b } = await twoPeriods("__test__ Elle");
    await linkPeriods(b.id, a.id, "100.00");
    const periods = (bBalance: string) => [
      { id: a.id, startDate: "2025-01-01", openingBalance: "100.00" },
      { id: b.id, startDate: "2026-01-01", openingBalance: bBalance },
    ];

    await patch(id, { name, active: true, periods: periods("0.00") });
    expect((await get(id)).body.periods[1]).toMatchObject({
      carriedFromPeriodId: a.id,
      carriedAmount: "100.00",
    });

    await patch(id, { name, active: true, periods: periods("120.00") });
    expect((await get(id)).body.periods[1]).toMatchObject({
      carriedFromPeriodId: null,
      carriedAmount: null,
    });
  });

  it("moving a period before its devir source drops the link", async () => {
    const { id, name, a, b } = await twoPeriods("__test__ Geri");
    await linkPeriods(b.id, a.id, "100.00");
    await patch(id, {
      name,
      active: true,
      periods: [
        { id: a.id, startDate: "2025-01-01", openingBalance: "100.00" },
        { id: b.id, startDate: "2024-01-01", openingBalance: "0.00" },
      ],
    });
    const moved = (await get(id)).body.periods.find((p) => p.id === b.id);
    expect(moved).toMatchObject({
      carriedFromPeriodId: null,
      carriedAmount: null,
    });
  });

  it("deleting a devir source clears the link", async () => {
    const { id, name, a, b } = await twoPeriods("__test__ Kaynaksız");
    await linkPeriods(b.id, a.id, "100.00");
    await patch(id, {
      name,
      active: true,
      periods: [{ id: b.id, startDate: "2026-01-01", openingBalance: "0.00" }],
    });
    expect((await get(id)).body.periods).toEqual([
      expect.objectContaining({
        id: b.id,
        carriedFromPeriodId: null,
        carriedAmount: null,
      }),
    ]);
  });

  it("PATCH without changes writes no audit entry", async () => {
    const { id, name, a, b } = await twoPeriods("__test__ Aynı");
    await patch(id, {
      name,
      active: true,
      periods: [
        { id: a.id, startDate: "2025-01-01", openingBalance: "100.00" },
        { id: b.id, startDate: "2026-01-01", openingBalance: "0.00" },
      ],
    });
    expect(await latestAudit(id, "update")).toBeUndefined();
  });
});

describe("POST /api/cash-accounts/:id/carry-over", () => {
  async function account(name: string, periods: PeriodInput[]) {
    const { body } = await create({ name: `${name} ${suffix}`, periods });
    const { body: detail } = await get(body.id);
    return { id: body.id as number, periods: detail.periods };
  }

  async function carry(id: number, fromPeriodId: number, toPeriodId: number) {
    return await cashAccountsRoute.request(
      `/${id}/carry-over`,
      json("POST", { fromPeriodId, toPeriodId }),
    );
  }

  const YEARS: PeriodInput[] = [
    { startDate: "2025-01-01", openingBalance: "100.00" },
    { startDate: "2026-01-01", openingBalance: "0.00" },
  ];

  it("carries the source's Bakiye into the destination", async () => {
    const { id, periods } = await account("__test__ Devir", YEARS);
    const [a, b] = periods;
    await addCollection(id, "50.00", "2025-06-01");

    const res = await carry(id, a.id, b.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: "Devir yapıldı",
      openingBalance: "150.00",
    });
    expect((await get(id)).body.periods[1]).toMatchObject({
      openingBalance: "150.00",
      carriedFromPeriodId: a.id,
      carriedAmount: "150.00",
      sourceBalance: "150.00",
    });

    const audit = await latestAudit(id, "carry_over");
    expect(audit.details).toEqual([
      { label: "Kaynak Dönem", value: "01.01.2025" },
      { label: "Hedef Dönem", value: "01.01.2026" },
      { label: "Önceki Başlangıç Bakiyesi", value: "0,00 TL" },
      { label: "Yeni Başlangıç Bakiyesi", value: "150,00 TL" },
    ]);
  });

  it("carries a negative Bakiye", async () => {
    const { id, periods } = await account("__test__ Eksi Devir", YEARS);
    await addPayment(id, "125.00", "2025-03-01");
    await carry(id, periods[0].id, periods[1].id);
    expect((await get(id)).body.periods[1].openingBalance).toBe("-25.00");
  });

  it("goes stale when the source changes", async () => {
    const { id, periods } = await account("__test__ Bayat", YEARS);
    await carry(id, periods[0].id, periods[1].id);
    await addCollection(id, "10.00", "2025-12-31");
    expect((await get(id)).body.periods[1]).toMatchObject({
      carriedAmount: "100.00",
      sourceBalance: "110.00",
    });
  });

  it("is audited again when repeated without a change", async () => {
    const { id, periods } = await account("__test__ Tekrar", YEARS);
    await carry(id, periods[0].id, periods[1].id);
    const first = await latestAudit(id, "carry_over");
    await carry(id, periods[0].id, periods[1].id);
    expect((await latestAudit(id, "carry_over")).id).toBeGreaterThan(first.id);
  });

  it("refuses a source that isn't earlier", async () => {
    const { id, periods } = await account("__test__ Ters", YEARS);
    for (const [from, to] of [
      [periods[1].id, periods[0].id],
      [periods[0].id, periods[0].id],
    ]) {
      const res = await carry(id, from, to);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(
        "Kaynak dönem, hedef dönemden önce olmalı",
      );
    }
    expect((await get(id)).body.periods[0].openingBalance).toBe("100.00");
  });

  it("refuses periods of another account", async () => {
    const mine = await account("__test__ Benim", YEARS);
    const other = await account("__test__ Onun", YEARS);
    const res = await carry(mine.id, mine.periods[0].id, other.periods[1].id);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Dönem bulunamadı");
  });

  it("carries into a future period", async () => {
    const { id, periods } = await account("__test__ İleri", [
      { startDate: "2026-01-01", openingBalance: "7.00" },
      { startDate: "2999-01-01", openingBalance: "0.00" },
    ]);
    expect((await carry(id, periods[0].id, periods[1].id)).status).toBe(200);
    expect((await get(id)).body.periods[1].openingBalance).toBe("7.00");
  });
});

describe("DELETE /api/cash-accounts/:id", () => {
  it("deletes an unused account and records it with its periods", async () => {
    const { body } = await create({
      name: `__test__ Silinecek ${suffix}`,
      periods: [{ startDate: "2026-01-01", openingBalance: "10.00" }],
    });
    const res = await cashAccountsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Kasa - Banka silindi");
    expect((await get(body.id)).res.status).toBe(404);

    const audit = await latestAudit(body.id, "delete");
    expect(audit.details).toContainEqual({
      label: "Dönemler",
      value: "01.01.2026: 10,00 TL",
    });
  });

  it("refuses while the account has records", async () => {
    const { body } = await create({ name: `__test__ Dolu ${suffix}` });
    await addPayment(body.id, "1.00");
    await addCollection(body.id, "2.00");

    const res = await cashAccountsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu hesaba ait 1 ödeme ve 1 tahsilat var. Silmek yerine pasif yapabilirsiniz.",
    );
    expect((await get(body.id)).res.status).toBe(200);
  });

  it("names only the kind of record it has", async () => {
    const { body } = await create({ name: `__test__ Ödemeli ${suffix}` });
    await addPayment(body.id, "1.00");
    await addPayment(body.id, "1.00");
    const res = await cashAccountsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect((await res.json()).error).toBe(
      "Bu hesaba ait 2 ödeme var. Silmek yerine pasif yapabilirsiniz.",
    );
  });
});

describe("unknown ids", () => {
  it("404s", async () => {
    // the largest integer id; no row has it
    const id = 2147483647;
    const responses = await Promise.all([
      cashAccountsRoute.request(`/${id}`),
      cashAccountsRoute.request(
        `/${id}`,
        json("PATCH", { name: "__test__ yok", active: true }),
      ),
      cashAccountsRoute.request(`/${id}`, { method: "DELETE" }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("Kasa - Banka bulunamadı");
    }
  });
});
