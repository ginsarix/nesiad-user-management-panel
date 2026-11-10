import { and, desc, eq, inArray } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  counterpartyTable,
  parameterTable,
  paymentTable,
} from "@/db/schema";
import { counterpartiesRoute } from "./counterparties";

const createdIds: number[] = [];
const parameterIds: number[] = [];

afterAll(async () => {
  if (createdIds.length) {
    await db
      .delete(paymentTable)
      .where(inArray(paymentTable.counterpartyId, createdIds));
    await db
      .delete(counterpartyTable)
      .where(inArray(counterpartyTable.id, createdIds));
  }
  if (parameterIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, parameterIds));
  }
});

/** Two payments (100.00 and 50.25) to the cari, inserted directly */
async function addPayments(counterpartyId: number) {
  const parameters = await db
    .insert(parameterTable)
    .values([
      {
        kind: "payment_category" as const,
        name: `__test__ Tür ${counterpartyId}`,
        nameKey: `__test__ tür ${counterpartyId}`,
      },
      {
        kind: "payment_method" as const,
        name: `__test__ Tip ${counterpartyId}`,
        nameKey: `__test__ tip ${counterpartyId}`,
      },
    ])
    .returning({ id: parameterTable.id });
  parameterIds.push(...parameters.map((p) => p.id));
  const [category, method] = parameters.map((p) => p.id);
  await db.insert(paymentTable).values(
    ["100.00", "50.25"].map((amount) => ({
      counterpartyId,
      amount,
      date: "2026-11-01",
      categoryId: category,
      methodId: method,
    })),
  );
}

// Ünvan is unique; keep this file's names apart from parallel runs
const suffix = crypto.randomUUID().slice(0, 8);

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const EMPTY = {
  city: "",
  district: "",
  address: "",
  phone: "",
  email: "",
};

async function createCounterparty(fields: Record<string, unknown>) {
  const res = await counterpartiesRoute.request(
    "/",
    json("POST", { ...EMPTY, ...fields }),
  );
  const body = await res.json();
  if (res.status === 201) createdIds.push(body.id);
  return { res, body };
}

async function getOne(id: number) {
  return counterpartiesRoute.request(`/${id}`);
}

async function listAll() {
  const res = await counterpartiesRoute.request("/");
  return (await res.json()) as { id: number; title: string }[];
}

async function lastEntry(action: string, id: number) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "counterparty"),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

describe("POST /api/counterparties", () => {
  it("creates a cari with trimmed fields and blanks as null", async () => {
    const { res, body } = await createCounterparty({
      title: `  __test__ Çiçekçi ${suffix} `,
      city: "Nevşehir",
      district: "Ürgüp",
      address: "",
      phone: " 0384 123 45 67 ",
      email: "",
    });
    expect(res.status).toBe(201);

    expect(await (await getOne(body.id)).json()).toEqual({
      id: body.id,
      title: `__test__ Çiçekçi ${suffix}`,
      city: "Nevşehir",
      district: "Ürgüp",
      address: null,
      phone: "0384 123 45 67",
      email: null,
      paymentCount: 0,
    });

    const entry = await lastEntry("create", body.id);
    expect(entry.entityLabel).toBe(`__test__ Çiçekçi ${suffix}`);
    expect(entry.details).toEqual([
      { label: "Ünvan", value: `__test__ Çiçekçi ${suffix}` },
      { label: "Şehir", value: "Nevşehir" },
      { label: "İlçe", value: "Ürgüp" },
      { label: "Adres", value: "—" },
      { label: "Telefon", value: "0384 123 45 67" },
      { label: "E-posta", value: "—" },
    ]);
  });

  it("requires an Ünvan", async () => {
    const { res, body } = await createCounterparty({ title: " " });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Ünvan boş olamaz", field: "title" });
  });

  it("rejects an invalid email", async () => {
    const { res, body } = await createCounterparty({
      title: `__test__ Eposta ${suffix}`,
      email: "yanlis",
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Geçerli bir e-posta adresi girin");
  });

  it("rejects an unknown province", async () => {
    const { res, body } = await createCounterparty({
      title: `__test__ İl ${suffix}`,
      city: "Nevsehir",
    });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Geçerli bir il seçin", field: "city" });
  });

  it("rejects a district of another province", async () => {
    const other = await createCounterparty({
      title: `__test__ İlçe ${suffix}`,
      city: "Nevşehir",
      district: "Kadıköy",
    });
    expect(other.res.status).toBe(400);
    expect(other.body).toEqual({
      error: "Geçerli bir ilçe seçin",
      field: "district",
    });

    const alone = await createCounterparty({
      title: `__test__ İlçe ${suffix}`,
      district: "Ürgüp",
    });
    expect(alone.res.status).toBe(400);
    expect(alone.body.error).toBe("Geçerli bir ilçe seçin");
  });

  it("rejects an Ünvan that differs only in Turkish case", async () => {
    await createCounterparty({ title: `__test__ İnci ${suffix}` });
    const { res, body } = await createCounterparty({
      title: `__TEST__ İNCİ ${suffix}`,
    });
    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Bu ünvanla bir cari zaten var",
      field: "title",
    });
  });
});

describe("GET /api/counterparties", () => {
  it("lists in Turkish order", async () => {
    const ids: number[] = [];
    for (const name of ["Dokuma", "Çelik", "Cam"]) {
      ids.push(
        (await createCounterparty({ title: `__test__ ${name} ${suffix}` })).body
          .id,
      );
    }
    const titles = (await listAll())
      .filter((c) => ids.includes(c.id))
      .map((c) => c.title);
    expect(titles).toEqual([
      `__test__ Cam ${suffix}`,
      `__test__ Çelik ${suffix}`,
      `__test__ Dokuma ${suffix}`,
    ]);
  });

  it("includes the payment count and total paid", async () => {
    const { body: empty } = await createCounterparty({
      title: `__test__ Boş ${suffix}`,
    });
    const { body } = await createCounterparty({
      title: `__test__ Toplam ${suffix}`,
    });
    await addPayments(body.id);

    const listed = await listAll();
    expect(listed.find((c) => c.id === empty.id)).toMatchObject({
      paymentCount: 0,
      totalPaid: "0.00",
    });
    expect(listed.find((c) => c.id === body.id)).toMatchObject({
      paymentCount: 2,
      totalPaid: "150.25",
    });
    expect(await (await getOne(body.id)).json()).toMatchObject({
      paymentCount: 2,
    });
  });
});

describe("PATCH /api/counterparties/:id", () => {
  it("updates and records only changed fields", async () => {
    const title = `__test__ Güncel ${suffix}`;
    const { body } = await createCounterparty({ title });

    const res = await counterpartiesRoute.request(
      `/${body.id}`,
      json("PATCH", { ...EMPTY, title, phone: "0555" }),
    );
    expect(res.status).toBe(200);
    expect((await lastEntry("update", body.id)).changes).toEqual([
      { label: "Telefon", from: "—", to: "0555" },
    ]);
  });

  it("records nothing when nothing changed", async () => {
    const title = `__test__ Aynı ${suffix}`;
    const { body } = await createCounterparty({ title });
    const res = await counterpartiesRoute.request(
      `/${body.id}`,
      json("PATCH", { ...EMPTY, title }),
    );
    expect(res.status).toBe(200);
    expect(await lastEntry("update", body.id)).toBeUndefined();
  });

  it("rejects renaming to another cari's Ünvan", async () => {
    await createCounterparty({ title: `__test__ Birinci ${suffix}` });
    const { body } = await createCounterparty({
      title: `__test__ İkinci ${suffix}`,
    });
    const res = await counterpartiesRoute.request(
      `/${body.id}`,
      json("PATCH", { ...EMPTY, title: `__test__ birinci ${suffix}` }),
    );
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/counterparties/:id", () => {
  it("deletes and records the whole record", async () => {
    const { body } = await createCounterparty({
      title: `__test__ Silinecek ${suffix}`,
      city: "Nevşehir",
    });
    const res = await counterpartiesRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await getOne(body.id)).status).toBe(404);
    expect((await lastEntry("delete", body.id)).details).toContainEqual({
      label: "Şehir",
      value: "Nevşehir",
    });
  });
});

describe("DELETE a cari with payments", () => {
  it("refuses and keeps the cari", async () => {
    const { body } = await createCounterparty({
      title: `__test__ Ödemeli ${suffix}`,
    });
    await addPayments(body.id);

    const res = await counterpartiesRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu cariye ait 2 ödeme var. Önce ödemeleri silin.",
    );
    expect((await getOne(body.id)).status).toBe(200);
  });
});

describe("unknown cari", () => {
  it("returns 404 for GET, PATCH and DELETE", async () => {
    expect((await getOne(2147483000)).status).toBe(404);
    const patch = await counterpartiesRoute.request(
      "/2147483000",
      json("PATCH", { ...EMPTY, title: `__test__ Yok ${suffix}` }),
    );
    expect(patch.status).toBe(404);
    const del = await counterpartiesRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(del.status).toBe(404);
  });
});

describe("GET /api/counterparties/export", () => {
  it("exports the searched cariler sorted by Ünvan", async () => {
    const { body: zeytin } = await createCounterparty({
      title: `__test__ Zeytin Excel ${suffix}`,
      city: "Nevşehir",
    });
    await createCounterparty({ title: `__test__ Çay Excel ${suffix}` });
    await addPayments(zeytin.id);

    const res = await counterpartiesRoute.request(
      `/export?q=${encodeURIComponent(`excel ${suffix}`)}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="cariler-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );

    const rows = await readSheet(Buffer.from(await res.arrayBuffer()));
    expect(rows[0]).toEqual([
      "Ünvan",
      "Şehir",
      "İlçe",
      "Adres",
      "Telefon",
      "E-posta",
      "Toplam Ödenen",
    ]);
    expect(rows.slice(1).map((row) => row[0])).toEqual([
      `__test__ Çay Excel ${suffix}`,
      `__test__ Zeytin Excel ${suffix}`,
    ]);
    expect(rows[2][1]).toBe("Nevşehir");
    expect(rows[2][6]).toBe(150.25);
    expect(rows[1][6]).toBe(0);
  });
});
