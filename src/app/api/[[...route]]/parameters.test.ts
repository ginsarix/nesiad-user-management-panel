import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogTable, parameterTable } from "@/db/schema";
import { parametersRoute } from "./parameters";

const createdIds: number[] = [];

afterAll(async () => {
  if (createdIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, createdIds));
  }
});

// names are unique within a list; keep them apart from parallel runs
const suffix = crypto.randomUUID().slice(0, 8);

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function createParameter(kind: string, name: string) {
  const res = await parametersRoute.request("/", json("POST", { kind, name }));
  const body = await res.json();
  if (res.status === 201) createdIds.push(body.id);
  return { res, body };
}

async function listParameters() {
  const res = await parametersRoute.request("/");
  return (await res.json()) as { id: number; kind: string; name: string }[];
}

async function lastEntry(action: string, id: number) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "parameter"),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

describe("POST /api/parameters", () => {
  it("adds a trimmed name to a list and records it", async () => {
    const { res, body } = await createParameter(
      "payment_method",
      `  __test__ Nakit ${suffix}  `,
    );
    expect(res.status).toBe(201);

    const listed = (await listParameters()).find((p) => p.id === body.id);
    expect(listed).toEqual({
      id: body.id,
      kind: "payment_method",
      name: `__test__ Nakit ${suffix}`,
    });

    const entry = await lastEntry("create", body.id);
    expect(entry.entityLabel).toBe(`Ödeme Tipi: __test__ Nakit ${suffix}`);
    expect(entry.details).toEqual([
      { label: "Liste", value: "Ödeme Tipi" },
      { label: "Ad", value: `__test__ Nakit ${suffix}` },
    ]);
  });

  it("requires a name", async () => {
    const { res, body } = await createParameter("payment_method", "   ");
    expect(res.status).toBe(400);
    expect(body.error).toBe("Ad boş olamaz");
  });

  it("rejects an unknown list", async () => {
    const { res } = await createParameter("sector", `__test__ X ${suffix}`);
    expect(res.status).toBe(400);
  });

  it("rejects a name already in the same list, ignoring Turkish case", async () => {
    await createParameter("collection_category", `__test__ Aidat ${suffix}`);
    const { res, body } = await createParameter(
      "collection_category",
      `__TEST__ AİDAT ${suffix}`,
    );
    expect(res.status).toBe(409);
    expect(body.error).toBe("Bu listede aynı isimde bir kayıt zaten var");
  });

  it("allows the same name in different lists", async () => {
    const name = `__test__ Kart ${suffix}`;
    const tahsilat = await createParameter("collection_method", name);
    const odeme = await createParameter("payment_method", name);
    expect(tahsilat.res.status).toBe(201);
    expect(odeme.res.status).toBe(201);
  });
});

describe("GET /api/parameters", () => {
  it("sorts by name in Turkish order", async () => {
    const ids = [
      (await createParameter("payment_category", `__test__ Yemek ${suffix}`))
        .body.id,
      (await createParameter("payment_category", `__test__ Çiçek ${suffix}`))
        .body.id,
      (await createParameter("payment_category", `__test__ Dergi ${suffix}`))
        .body.id,
    ];

    const names = (await listParameters())
      .filter((p) => ids.includes(p.id))
      .map((p) => p.name);
    expect(names).toEqual([
      `__test__ Çiçek ${suffix}`,
      `__test__ Dergi ${suffix}`,
      `__test__ Yemek ${suffix}`,
    ]);
  });
});

describe("PATCH /api/parameters/:id", () => {
  it("renames an entry and records the change", async () => {
    const { body } = await createParameter(
      "collection_method",
      `__test__ Hesap ${suffix}`,
    );
    const res = await parametersRoute.request(
      `/${body.id}`,
      json("PATCH", { name: `__test__ Banka ${suffix}` }),
    );
    expect(res.status).toBe(200);

    const listed = (await listParameters()).find((p) => p.id === body.id);
    expect(listed?.name).toBe(`__test__ Banka ${suffix}`);

    const entry = await lastEntry("update", body.id);
    expect(entry.entityLabel).toBe(`Tahsilat Tipi: __test__ Banka ${suffix}`);
    expect(entry.changes).toEqual([
      {
        label: "Ad",
        from: `__test__ Hesap ${suffix}`,
        to: `__test__ Banka ${suffix}`,
      },
    ]);
  });

  it("records nothing when the name is unchanged", async () => {
    const { body } = await createParameter(
      "collection_method",
      `__test__ Aynı ${suffix}`,
    );
    const res = await parametersRoute.request(
      `/${body.id}`,
      json("PATCH", { name: `__test__ Aynı ${suffix}` }),
    );
    expect(res.status).toBe(200);
    expect(await lastEntry("update", body.id)).toBeUndefined();
  });

  it("rejects renaming to a name already in the list", async () => {
    await createParameter("payment_category", `__test__ Çelenk ${suffix}`);
    const { body } = await createParameter(
      "payment_category",
      `__test__ Kira ${suffix}`,
    );
    const res = await parametersRoute.request(
      `/${body.id}`,
      json("PATCH", { name: `__test__ çelenk ${suffix}` }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown entry", async () => {
    const res = await parametersRoute.request(
      "/2147483000",
      json("PATCH", { name: `__test__ Yok ${suffix}` }),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/parameters/:id", () => {
  it("deletes the entry and records what it was", async () => {
    const { body } = await createParameter(
      "collection_category",
      `__test__ Giriş Ücreti ${suffix}`,
    );
    const res = await parametersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await listParameters()).some((p) => p.id === body.id)).toBe(false);

    const entry = await lastEntry("delete", body.id);
    expect(entry.details).toEqual([
      { label: "Liste", value: "Tahsilat Türü" },
      { label: "Ad", value: `__test__ Giriş Ücreti ${suffix}` },
    ]);
  });

  it("returns 404 for an unknown entry", async () => {
    const res = await parametersRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
