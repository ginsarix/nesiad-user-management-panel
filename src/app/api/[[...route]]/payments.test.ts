import { and, desc, eq, inArray } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  counterpartyTable,
  parameterTable,
  paymentTable,
} from "@/db/schema";
import { todayInIstanbul } from "@/lib/dates";
import { sumAmounts } from "@/lib/money";
import { counterpartiesRoute } from "./counterparties";
import { paymentsRoute } from "./payments";

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
let kart: number;
let nakit: number;
let tahsilat: number;

beforeAll(async () => {
  cari = await insertCounterparty(`__test__ Çiçekçi ${suffix}`);
  otherCari = await insertCounterparty(`__test__ Lokanta ${suffix}`);
  cicek = await insertParameter("payment_category", `__test__ Çiçek ${suffix}`);
  yemek = await insertParameter("payment_category", `__test__ Yemek ${suffix}`);
  kart = await insertParameter("payment_method", `__test__ Kart ${suffix}`);
  nakit = await insertParameter("payment_method", `__test__ Nakit ${suffix}`);
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
});

function validPayment(overrides: Record<string, unknown> = {}) {
  return {
    counterpartyId: cari,
    amount: "1250.50",
    date: "2026-11-01",
    categoryId: cicek,
    methodId: kart,
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
      methodId: kart,
      methodName: `__test__ Kart ${suffix}`,
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
      "Ödeme Tipi",
      "Not",
    ]);
  });

  it.each(["counterpartyId", "amount", "date", "categoryId", "methodId"])(
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
    const category = await createPayment({ categoryId: kart });
    expect(category.res.status).toBe(400);
    expect(category.body.error).toBe("Geçerli bir ödeme türü seçin");

    const method = await createPayment({ methodId: tahsilat });
    expect(method.res.status).toBe(400);
    expect(method.body.error).toBe("Geçerli bir ödeme tipi seçin");
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

    const byMethod = await list(`counterparty=${otherCari}&method=${nakit}`);
    expect(byMethod).toEqual({ payments: [], count: 0 });
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
      json("PATCH", validPayment({ amount: "99.00", methodId: nakit })),
    );
    expect(res.status).toBe(200);

    expect((await lastEntry("update", body.id)).changes).toEqual([
      { label: "Tutar", from: "₺1.250,50", to: "₺99,00" },
      {
        label: "Ödeme Tipi",
        from: `__test__ Kart ${suffix}`,
        to: `__test__ Nakit ${suffix}`,
      },
    ]);
  });

  it("records nothing when nothing changed", async () => {
    const { body } = await createPayment();
    await paymentsRoute.request(`/${body.id}`, json("PATCH", validPayment()));
    expect(await lastEntry("update", body.id)).toBeUndefined();
  });

  it("validates like create", async () => {
    const { body } = await createPayment();
    const res = await paymentsRoute.request(
      `/${body.id}`,
      json("PATCH", validPayment({ categoryId: nakit })),
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
      "Ödeme Tipi",
      "Not",
    ]);
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
