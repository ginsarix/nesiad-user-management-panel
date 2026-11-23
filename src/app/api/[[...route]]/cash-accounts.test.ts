import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  authorizedRepresentativeTable,
  collectionTable,
  counterpartyTable,
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
let yetkili: number;
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
  const [representative] = await db
    .insert(authorizedRepresentativeTable)
    .values({ name: `__test__ Kasa yetkili ${suffix}`, active: true })
    .returning({ id: authorizedRepresentativeTable.id });
  yetkili = representative.id;
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
  await db
    .delete(authorizedRepresentativeTable)
    .where(eq(authorizedRepresentativeTable.id, yetkili));
  await db
    .delete(parameterTable)
    .where(inArray(parameterTable.id, parameterIds));
});

async function addPayment(cashAccountId: number, amount: string) {
  const [row] = await db
    .insert(paymentTable)
    .values({
      counterpartyId: cari,
      amount,
      date: "2026-11-01",
      categoryId: paymentCategory,
      cashAccountId,
    })
    .returning({ id: paymentTable.id });
  paymentIds.push(row.id);
}

async function addCollection(cashAccountId: number, amount: string) {
  const [row] = await db
    .insert(collectionTable)
    .values({
      representativeId: yetkili,
      amount,
      date: "2026-11-01",
      categoryId: collectionCategory,
      cashAccountId,
    })
    .returning({ id: collectionTable.id });
  collectionIds.push(row.id);
}

async function create(values: Record<string, unknown>) {
  const res = await cashAccountsRoute.request(
    "/",
    json("POST", { openingBalance: "0.00", active: true, ...values }),
  );
  const body = await res.json();
  if (res.status === 201) accountIds.push(body.id);
  return { res, body };
}

type Account = {
  id: number;
  name: string;
  openingBalance: string;
  active: boolean;
  balance: string;
  paymentCount: number;
  collectionCount: number;
};

async function get(id: number) {
  const res = await cashAccountsRoute.request(`/${id}`);
  return { res, body: (await res.json()) as Account };
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
  it("creates with opening balance 0 and records it", async () => {
    const { res, body } = await create({
      name: ` __test__ Merkez Kasa ${suffix} `,
    });
    expect(res.status).toBe(201);
    expect(body.message).toBe("Kasa - Banka kaydedildi");

    const { body: account } = await get(body.id);
    expect(account).toMatchObject({
      name: `__test__ Merkez Kasa ${suffix}`,
      openingBalance: "0.00",
      balance: "0.00",
      active: true,
      paymentCount: 0,
      collectionCount: 0,
    });

    const audit = await latestAudit(body.id, "create");
    expect(audit.details).toEqual([
      { label: "İsim", value: `__test__ Merkez Kasa ${suffix}` },
      { label: "Başlangıç Bakiyesi", value: "₺0,00" },
      { label: "Durum", value: "Aktif" },
    ]);
  });

  it("allows a negative opening balance", async () => {
    const { body } = await create({
      name: `__test__ Eksi ${suffix}`,
      openingBalance: "-500.00",
    });
    expect((await get(body.id)).body.balance).toBe("-500.00");
  });

  it("refuses a malformed opening balance", async () => {
    const { res, body } = await create({
      name: `__test__ Bozuk ${suffix}`,
      openingBalance: "1.250,00",
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
      openingBalance: "1000.00",
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

    const res = await cashAccountsRoute.request("/");
    const list = (await res.json()) as Account[];
    expect(list.find((a) => a.id === body.id)).toMatchObject({
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
});

describe("PATCH /api/cash-accounts/:id", () => {
  it("audits the changed fields only", async () => {
    const name = `__test__ Vakıf ${suffix}`;
    const { body } = await create({ name });

    const res = await cashAccountsRoute.request(
      `/${body.id}`,
      json("PATCH", { name, openingBalance: "1250.00", active: false }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Kasa - Banka güncellendi");

    const audit = await latestAudit(body.id, "update");
    expect(audit.changes).toEqual([
      { label: "Başlangıç Bakiyesi", from: "₺0,00", to: "₺1.250,00" },
      { label: "Durum", from: "Aktif", to: "Pasif" },
    ]);
    expect((await get(body.id)).body).toMatchObject({
      balance: "1250.00",
      active: false,
    });

    // the same values again write nothing
    await cashAccountsRoute.request(
      `/${body.id}`,
      json("PATCH", { name, openingBalance: "1250.00", active: false }),
    );
    expect((await latestAudit(body.id, "update")).id).toBe(audit.id);
  });

  it("refuses a name another account has", async () => {
    await create({ name: `__test__ Halk ${suffix}` });
    const { body } = await create({ name: `__test__ Halk 2 ${suffix}` });
    const res = await cashAccountsRoute.request(
      `/${body.id}`,
      json("PATCH", {
        name: `__test__ HALK ${suffix}`,
        openingBalance: "0.00",
        active: true,
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe("name");
  });
});

describe("DELETE /api/cash-accounts/:id", () => {
  it("deletes an unused account and records it", async () => {
    const { body } = await create({
      name: `__test__ Silinecek ${suffix}`,
      openingBalance: "10.00",
    });
    const res = await cashAccountsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Kasa - Banka silindi");
    expect((await get(body.id)).res.status).toBe(404);

    const audit = await latestAudit(body.id, "delete");
    expect(audit.details).toContainEqual({
      label: "Başlangıç Bakiyesi",
      value: "₺10,00",
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
        json("PATCH", {
          name: "__test__ yok",
          openingBalance: "0.00",
          active: true,
        }),
      ),
      cashAccountsRoute.request(`/${id}`, { method: "DELETE" }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("Kasa - Banka bulunamadı");
    }
  });
});
