import { and, desc, eq, inArray } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  cashAccountTable,
  counterpartyTable,
  parameterTable,
  paymentTable,
} from "@/db/schema";
import { todayInIstanbul } from "@/lib/dates";
import { sumAmounts } from "@/lib/money";
import {
  deleteTestCashAccounts,
  insertTestCashAccount,
} from "@/test/cash-accounts";
import { cashAccountsRoute } from "./cash-accounts";
import { counterpartiesRoute } from "./counterparties";
import { paymentsRoute } from "./payments";

// Kasa - Banka fixtures, deleted after the records using them
const cashAccountIds: number[] = [];

const suffix = crypto.randomUUID().slice(0, 8);
const paymentIds: number[] = [];
const counterpartyIds: number[] = [];
const parameterIds: number[] = [];

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

async function insertCounterparty(title: string) {
  const [row] = await db
    .insert(counterpartyTable)
    .values({ title, titleKey: title.toLocaleLowerCase("tr") })
    .returning({ id: counterpartyTable.id });
  counterpartyIds.push(row.id);
  return row.id;
}

let cari: number;
let otherCari: number;
let cicek: number;
let yemek: number;
let kasa: number;
let banka: number;
let pasifKasa: number;
let tahsilat: number;

beforeAll(async () => {
  cari = await insertCounterparty(`__test__ Çiçekçi ${suffix}`);
  otherCari = await insertCounterparty(`__test__ Lokanta ${suffix}`);
  cicek = await insertParameter("payment_category", `__test__ Çiçek ${suffix}`);
  yemek = await insertParameter("payment_category", `__test__ Yemek ${suffix}`);
  kasa = await insertTestCashAccount(`__test__ Kasa ${suffix}`, cashAccountIds);
  banka = await insertTestCashAccount(
    `__test__ Banka ${suffix}`,
    cashAccountIds,
  );
  pasifKasa = await insertTestCashAccount(
    `__test__ Pasif Kasa ${suffix}`,
    cashAccountIds,
    { active: false },
  );
  tahsilat = await insertParameter(
    "collection_category",
    `__test__ Aidat ${suffix}`,
  );
});

afterAll(async () => {
  if (paymentIds.length) {
    await db.delete(paymentTable).where(inArray(paymentTable.id, paymentIds));
  }
  if (counterpartyIds.length) {
    await db
      .delete(counterpartyTable)
      .where(inArray(counterpartyTable.id, counterpartyIds));
  }
  if (parameterIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, parameterIds));
  }
  await deleteTestCashAccounts(cashAccountIds);
});

function validPayment(overrides: Record<string, unknown> = {}) {
  return {
    counterpartyId: cari,
    amount: "1250.50",
    date: "2026-11-01",
    categoryId: cicek,
    cashAccountId: kasa,
    note: "",
    ...overrides,
  };
}

async function createPayment(overrides: Record<string, unknown> = {}) {
  const res = await paymentsRoute.request(
    "/",
    json("POST", validPayment(overrides)),
  );
  const body = await res.json();
  if (res.status === 201) paymentIds.push(body.id);
  return { res, body };
}

async function balanceOf(cashAccountId: number) {
  const res = await cashAccountsRoute.request(`/${cashAccountId}`);
  return ((await res.json()) as { balance: string }).balance;
}

async function list(query: string) {
  const res = await paymentsRoute.request(`/?${query}`);
  return (await res.json()) as {
    payments: {
      id: number;
      date: string;
      amount: string;
      counterpartyTitle: string;
    }[];
    count: number;
  };
}

/** What the page shows as Toplam: the rows' amounts, summed in kuruş */
function totalOf({ payments }: Awaited<ReturnType<typeof list>>) {
  return sumAmounts(payments.map((payment) => payment.amount));
}

async function lastEntry(action: string, id: number) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "payment"),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

describe("POST /api/payments", () => {
  it("creates a payment and records it", async () => {
    const { res, body } = await createPayment({ note: " Çelenk " });
    expect(res.status).toBe(201);

    const got = await (await paymentsRoute.request(`/${body.id}`)).json();
    expect(got).toEqual({
      id: body.id,
      date: "2026-11-01",
      amount: "1250.50",
      note: "Çelenk",
      counterpartyId: cari,
      counterpartyTitle: `__test__ Çiçekçi ${suffix}`,
      categoryId: cicek,
      categoryName: `__test__ Çiçek ${suffix}`,
      cashAccountId: kasa,
      cashAccountName: `__test__ Kasa ${suffix}`,
    });

    const entry = await lastEntry("create", body.id);
    expect(entry.entityLabel).toBe(
      `__test__ Çiçekçi ${suffix} · ₺1.250,50 · 01.11.2026`,
    );
    expect(entry.details?.map((d) => d.label)).toEqual([
      "Cari",
      "Tutar",
      "Tarih",
      "Ödeme Türü",
      "Kasa - Banka",
      "Not",
    ]);
  });

  it.each(["counterpartyId", "amount", "date", "categoryId", "cashAccountId"])(
    "requires %s",
    async (field) => {
      const { res } = await createPayment({ [field]: undefined });
      expect(res.status).toBe(400);
    },
  );

  it.each(["0.00", "-1.00", "1,5", "12.345"])(
    "rejects the amount %s",
    async (amount) => {
      const { res } = await createPayment({ amount });
      expect(res.status).toBe(400);
    },
  );

  it("rejects a future date", async () => {
    const tomorrow = todayInIstanbul(new Date(Date.now() + 86_400_000));
    const { res, body } = await createPayment({ date: tomorrow });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Tarih gelecekte olamaz");
  });

  it("rejects a parameter from the wrong list", async () => {
    const category = await createPayment({ categoryId: tahsilat });
    expect(category.res.status).toBe(400);
    expect(category.body).toEqual({
      error: "Geçerli bir ödeme türü seçin",
      field: "categoryId",
    });
  });

  it("needs an Aktif Kasa - Banka", async () => {
    const pasif = await createPayment({ cashAccountId: pasifKasa });
    expect(pasif.res.status).toBe(400);
    expect(pasif.body).toEqual({
      error: "Seçilen Kasa - Banka aktif değil",
      field: "cashAccountId",
    });
    const unknown = await createPayment({ cashAccountId: 2147483000 });
    expect(unknown.res.status).toBe(400);
    expect(unknown.body).toEqual({
      error: "Seçilen Kasa - Banka bulunamadı",
      field: "cashAccountId",
    });
  });

  it("rejects an unknown cari", async () => {
    const { res, body } = await createPayment({ counterpartyId: 2147483000 });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Seçilen cari bulunamadı");
  });
});

describe("GET /api/payments", () => {
  it("filters, orders newest first and sums kuruş exactly", async () => {
    const first = await createPayment({
      counterpartyId: otherCari,
      amount: "0.10",
      date: "2026-10-01",
    });
    const second = await createPayment({
      counterpartyId: otherCari,
      amount: "0.20",
      date: "2026-10-15",
      categoryId: yemek,
      cashAccountId: banka,
    });
    const third = await createPayment({
      counterpartyId: otherCari,
      amount: "100.00",
      date: "2026-11-01",
    });

    const all = await list(`counterparty=${otherCari}`);
    expect(all.count).toBe(3);
    expect(all).not.toHaveProperty("total");
    expect(totalOf(all)).toBe("100.30");
    expect(all.payments.map((p) => p.id)).toEqual([
      third.body.id,
      second.body.id,
      first.body.id,
    ]);

    const october = await list(
      `counterparty=${otherCari}&from=2026-10-01&to=2026-10-15`,
    );
    expect(october.count).toBe(2);
    expect(totalOf(october)).toBe("0.30");

    const byCategory = await list(
      `counterparty=${otherCari}&category=${yemek}`,
    );
    expect(byCategory.payments.map((p) => p.id)).toEqual([second.body.id]);

    const byAccount = await list(
      `counterparty=${otherCari}&cashAccount=${banka}`,
    );
    expect(byAccount.payments.map((p) => p.id)).toEqual([second.body.id]);
  });

  it("shows the current cari title", async () => {
    const renamed = await insertCounterparty(`__test__ Eski Ad ${suffix}`);
    await createPayment({ counterpartyId: renamed });
    await counterpartiesRoute.request(
      `/${renamed}`,
      json("PATCH", { title: `__test__ Yeni Ad ${suffix}` }),
    );

    const { payments } = await list(`counterparty=${renamed}`);
    expect(payments[0].counterpartyTitle).toBe(`__test__ Yeni Ad ${suffix}`);
  });
});

describe("PATCH /api/payments/:id", () => {
  it("updates and records the changed fields", async () => {
    const { body } = await createPayment();
    const res = await paymentsRoute.request(
      `/${body.id}`,
      json("PATCH", validPayment({ amount: "99.00", cashAccountId: banka })),
    );
    expect(res.status).toBe(200);

    expect((await lastEntry("update", body.id)).changes).toEqual([
      { label: "Tutar", from: "₺1.250,50", to: "₺99,00" },
      {
        label: "Kasa - Banka",
        from: `__test__ Kasa ${suffix}`,
        to: `__test__ Banka ${suffix}`,
      },
    ]);
  });

  it("records nothing when nothing changed", async () => {
    const { body } = await createPayment();
    await paymentsRoute.request(`/${body.id}`, json("PATCH", validPayment()));
    expect(await lastEntry("update", body.id)).toBeUndefined();
  });

  it("keeps a Kasa - Banka that became Pasif, refuses another", async () => {
    const closing = await insertTestCashAccount(
      `__test__ Kapanan ${suffix}`,
      cashAccountIds,
    );
    const { body } = await createPayment({ cashAccountId: closing });
    await db
      .update(cashAccountTable)
      .set({ active: false })
      .where(eq(cashAccountTable.id, closing));

    const keep = await paymentsRoute.request(
      `/${body.id}`,
      json("PATCH", validPayment({ cashAccountId: closing, amount: "5.00" })),
    );
    expect(keep.status).toBe(200);
    const other = await paymentsRoute.request(
      `/${body.id}`,
      json("PATCH", validPayment({ cashAccountId: pasifKasa })),
    );
    expect(other.status).toBe(400);
  });

  it("subtracts from the Bakiye, following edits and deletes", async () => {
    const account = await insertTestCashAccount(
      `__test__ Bakiye ${suffix}`,
      cashAccountIds,
      { openingBalance: "1000.00" },
    );
    const { body } = await createPayment({
      cashAccountId: account,
      amount: "250.00",
    });
    expect(await balanceOf(account)).toBe("750.00");

    await paymentsRoute.request(
      `/${body.id}`,
      json("PATCH", validPayment({ cashAccountId: account, amount: "300.00" })),
    );
    expect(await balanceOf(account)).toBe("700.00");

    await paymentsRoute.request(`/${body.id}`, { method: "DELETE" });
    expect(await balanceOf(account)).toBe("1000.00");
  });

  it("moving a payment moves its amount", async () => {
    const from = await insertTestCashAccount(
      `__test__ Eski Hesap ${suffix}`,
      cashAccountIds,
      { openingBalance: "100.00" },
    );
    const to = await insertTestCashAccount(
      `__test__ Yeni Hesap ${suffix}`,
      cashAccountIds,
      { openingBalance: "100.00" },
    );
    const { body } = await createPayment({
      cashAccountId: from,
      amount: "40.00",
    });
    expect(await balanceOf(from)).toBe("60.00");

    await paymentsRoute.request(
      `/${body.id}`,
      json("PATCH", validPayment({ cashAccountId: to, amount: "40.00" })),
    );
    expect(await balanceOf(from)).toBe("100.00");
    expect(await balanceOf(to)).toBe("60.00");
  });

  it("validates like create", async () => {
    const { body } = await createPayment();
    const res = await paymentsRoute.request(
      `/${body.id}`,
      json("PATCH", validPayment({ categoryId: tahsilat })),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/payments/:id", () => {
  it("deletes and records the whole record", async () => {
    const { body } = await createPayment();
    const res = await paymentsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await paymentsRoute.request(`/${body.id}`)).status).toBe(404);
    expect((await lastEntry("delete", body.id)).details).toContainEqual({
      label: "Tutar",
      value: "₺1.250,50",
    });
  });

  it("returns 404 for an unknown payment", async () => {
    const res = await paymentsRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/payments/export", () => {
  it("exports the filtered payments with real cells and a total", async () => {
    const excelCari = await insertCounterparty(`__test__ Excel ${suffix}`);
    for (const [amount, date] of [
      ["0.10", "2026-10-01"],
      ["0.20", "2026-10-15"],
      ["100.00", "2026-11-01"],
    ]) {
      await createPayment({ counterpartyId: excelCari, amount, date });
    }

    const res = await paymentsRoute.request(
      `/export?counterparty=${excelCari}&from=2026-10-01&to=2026-10-15`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="odemeler-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );

    const rows = await readSheet(Buffer.from(await res.arrayBuffer()));
    expect(rows[0]).toEqual([
      "Tarih",
      "Cari",
      "Tutar",
      "Ödeme Türü",
      "Kasa - Banka",
      "Not",
    ]);
    expect(rows[1][4]).toBe(`__test__ Kasa ${suffix}`);
    expect(rows[1][0]).toEqual(new Date("2026-10-15T00:00:00Z"));
    expect(rows[1][1]).toBe(`__test__ Excel ${suffix}`);
    expect(rows[1][2]).toBe(0.2);
    expect(rows[2][0]).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(rows[2][2]).toBe(0.1);

    const totalRow = rows[rows.length - 1];
    expect(totalRow[0]).toBe("Toplam");
    expect(totalRow[2]).toBeCloseTo(0.3, 10);
    expect(rows).toHaveLength(5); // header, 2 payments, blank, total
  });
});
