import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  collectionTable,
  committeeMemberTable,
  committeeTable,
  counterpartyTable,
  memberTable,
  parameterTable,
  paymentTable,
} from "@/db/schema";
import {
  deleteTestCashAccounts,
  insertTestCashAccount,
} from "@/test/cash-accounts";
import { parametersRoute } from "./parameters";

// Kasa - Banka fixtures, deleted after the records using them
const cashAccountIds: number[] = [];

const createdIds: number[] = [];
const counterpartyIds: number[] = [];
// members with tahsilatlar, removed with them before the rest
const payerIds: number[] = [];

const committeeIds: number[] = [];
const memberIds: number[] = [];

afterAll(async () => {
  if (payerIds.length) {
    await db
      .delete(collectionTable)
      .where(inArray(collectionTable.memberId, payerIds));
    await db.delete(memberTable).where(inArray(memberTable.id, payerIds));
  }
  if (committeeIds.length) {
    await db
      .delete(committeeTable)
      .where(inArray(committeeTable.id, committeeIds));
  }
  if (memberIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
  }
  if (counterpartyIds.length) {
    await db
      .delete(paymentTable)
      .where(inArray(paymentTable.counterpartyId, counterpartyIds));
    await db
      .delete(counterpartyTable)
      .where(inArray(counterpartyTable.id, counterpartyIds));
  }
  if (createdIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, createdIds));
  }
  await deleteTestCashAccounts(cashAccountIds);
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
  return (await res.json()) as {
    id: number;
    kind: string;
    name: string;
    usageCount: number;
  }[];
}

/** One payment using the Ödeme Türü, to a cari made for it */
async function addPayment(categoryId: number) {
  const title = `__test__ Cari ${crypto.randomUUID().slice(0, 8)}`;
  const [counterparty] = await db
    .insert(counterpartyTable)
    .values({ title, titleKey: title.toLocaleLowerCase("tr") })
    .returning({ id: counterpartyTable.id });
  counterpartyIds.push(counterparty.id);
  await db.insert(paymentTable).values({
    counterpartyId: counterparty.id,
    amount: "10.00",
    date: "2026-11-01",
    categoryId,
    cashAccountId: await insertTestCashAccount(title, cashAccountIds),
  });
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
      "payment_category",
      `  __test__ Nakit ${suffix}  `,
    );
    expect(res.status).toBe(201);

    const listed = (await listParameters()).find((p) => p.id === body.id);
    expect(listed).toEqual({
      id: body.id,
      kind: "payment_category",
      name: `__test__ Nakit ${suffix}`,
      usageCount: 0,
    });

    const entry = await lastEntry("create", body.id);
    expect(entry.entityLabel).toBe(`Ödeme Türü: __test__ Nakit ${suffix}`);
    expect(entry.details).toEqual([
      { label: "Liste", value: "Ödeme Türü" },
      { label: "Ad", value: `__test__ Nakit ${suffix}` },
    ]);
  });

  it("adds to the Dernek Görevleri list", async () => {
    const { res, body } = await createParameter(
      "association_role",
      `__test__ Sayman ${suffix}`,
    );
    expect(res.status).toBe(201);

    const entry = await lastEntry("create", body.id);
    expect(entry.entityLabel).toBe(`Dernek Görevi: __test__ Sayman ${suffix}`);
  });

  it("requires a name", async () => {
    const { res, body } = await createParameter("payment_category", "   ");
    expect(res.status).toBe(400);
    expect(body.error).toBe("Ad boş olamaz");
  });

  it("rejects an unknown list", async () => {
    const { res } = await createParameter("sector", `__test__ X ${suffix}`);
    expect(res.status).toBe(400);
  });

  it("rejects the removed Ödeme Tipi and Tahsilat Tipi lists", async () => {
    for (const kind of ["payment_method", "collection_method"]) {
      const { res } = await createParameter(kind, `__test__ Tip ${suffix}`);
      expect(res.status).toBe(400);
    }
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
    const tahsilat = await createParameter("collection_category", name);
    const odeme = await createParameter("payment_category", name);
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
      "collection_category",
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
    expect(entry.entityLabel).toBe(`Tahsilat Türü: __test__ Banka ${suffix}`);
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
      "collection_category",
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

describe("parameters used by payments", () => {
  it("counts payments per entry and refuses to delete a used one", async () => {
    const category = (
      await createParameter("payment_category", `__test__ Kullanılan ${suffix}`)
    ).body.id;
    await addPayment(category);

    const listed = await listParameters();
    expect(listed.find((p) => p.id === category)?.usageCount).toBe(1);

    const res = await parametersRoute.request(`/${category}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu kayıt 1 ödemede kullanılıyor, silinemez.",
    );
    expect((await listParameters()).some((p) => p.id === category)).toBe(true);
  });
});

describe("parameters used by tahsilatlar", () => {
  it("counts them in usageCount and refuses to delete a used entry", async () => {
    const category = (
      await createParameter("collection_category", `__test__ Aidat K ${suffix}`)
    ).body.id;
    const [payer] = await db
      .insert(memberTable)
      .values({ firstName: "__test__ Ödeyen", lastName: suffix })
      .returning({ id: memberTable.id });
    payerIds.push(payer.id);
    await db.insert(collectionTable).values({
      memberId: payer.id,
      categoryId: category,
      cashAccountId: await insertTestCashAccount(
        `__test__ EFT ${suffix}`,
        cashAccountIds,
      ),
      amount: "10.00",
      date: "2026-11-01",
    });

    expect(
      (await listParameters()).find((p) => p.id === category)?.usageCount,
    ).toBe(1);
    const res = await parametersRoute.request(`/${category}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu kayıt 1 tahsilat veya tahakkuk kaydında kullanılıyor, silinemez.",
    );
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

  it("refuses to delete a Dernek Görevi a group uses", async () => {
    const { body } = await createParameter(
      "association_role",
      `__test__ Sayman Görevi ${suffix}`,
    );
    const [member] = await db
      .insert(memberTable)
      .values({ firstName: "__test__ Görevli", lastName: suffix })
      .returning({ id: memberTable.id });
    memberIds.push(member.id);
    const groupName = `__test__ Görevli Komite ${suffix}`;
    const [group] = await db
      .insert(committeeTable)
      .values({ name: groupName, nameKey: groupName.toLocaleLowerCase("tr") })
      .returning({ id: committeeTable.id });
    committeeIds.push(group.id);
    await db.insert(committeeMemberTable).values({
      groupId: group.id,
      memberId: member.id,
      roleId: body.id,
      position: 0,
    });

    const listed = (await listParameters()).find((p) => p.id === body.id);
    expect(listed?.usageCount).toBe(1);

    const res = await parametersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Bu kayıt 1 organizasyon kaydında kullanılıyor, silinemez.",
    });
  });

  it("returns 404 for an unknown entry", async () => {
    const res = await parametersRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
