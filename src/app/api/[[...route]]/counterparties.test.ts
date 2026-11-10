import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogTable, counterpartyTable } from "@/db/schema";
import { counterpartiesRoute } from "./counterparties";

const createdIds: number[] = [];

afterAll(async () => {
  if (createdIds.length) {
    await db
      .delete(counterpartyTable)
      .where(inArray(counterpartyTable.id, createdIds));
  }
});

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
    const { body } = await createCounterparty({
      title: `__test__ Toplam ${suffix}`,
    });
    const listed = (await listAll()).find((c) => c.id === body.id);
    expect(listed).toMatchObject({ paymentCount: 0, totalPaid: "0.00" });
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
