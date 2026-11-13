import { and, eq, gt, inArray, max } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  accrualTable,
  auditLogTable,
  authorizedRepresentativeTable,
  parameterTable,
} from "@/db/schema";
import type { ParameterKind } from "@/lib/parameters";
import { accrualsRoute } from "./accruals";
import { parametersRoute } from "./parameters";
import { representativesRoute } from "./representatives";

// There is one Tahakkuk list and tests run on the development database:
// keep its rows and put them back afterwards. Every test touching the
// accrual table lives in this file, so they never run in parallel.
let savedRows: (typeof accrualTable.$inferSelect)[] = [];
let lastAuditId = 0;
const representativeIds: number[] = [];
const parameterIds: number[] = [];
const suffix = crypto.randomUUID().slice(0, 8);

beforeAll(async () => {
  savedRows = await db.select().from(accrualTable);
  const [row] = await db
    .select({ id: max(auditLogTable.id) })
    .from(auditLogTable);
  lastAuditId = row?.id ?? 0;
});

afterAll(async () => {
  await db.transaction(async (tx) => {
    await tx.delete(accrualTable);
    if (savedRows.length) {
      await tx.insert(accrualTable).overridingSystemValue().values(savedRows);
    }
  });
  await db
    .delete(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "accrual"),
        gt(auditLogTable.id, lastAuditId),
      ),
    );
  if (representativeIds.length) {
    await db
      .delete(authorizedRepresentativeTable)
      .where(inArray(authorizedRepresentativeTable.id, representativeIds));
  }
  if (parameterIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, parameterIds));
  }
});

async function addRepresentative(name: string, active = true) {
  const [representative] = await db
    .insert(authorizedRepresentativeTable)
    .values({ name: `__test__ ${name} ${suffix}`, active })
    .returning({
      id: authorizedRepresentativeTable.id,
      name: authorizedRepresentativeTable.name,
    });
  representativeIds.push(representative.id);
  return representative;
}

/** A __test__ Tahsilat Türü (or another list's entry), inserted directly */
async function addParameter(
  name: string,
  kind: ParameterKind = "collection_category",
) {
  const fullName = `__test__ ${name} ${suffix}`;
  const [parameter] = await db
    .insert(parameterTable)
    .values({ kind, name: fullName, nameKey: fullName.toLocaleLowerCase("tr") })
    .returning({ id: parameterTable.id, name: parameterTable.name });
  parameterIds.push(parameter.id);
  return parameter;
}

type Row = { representativeId: number; categoryId: number; amount: string };

async function getAccruals() {
  return (await (await accrualsRoute.request("/")).json()) as {
    rows: (Row & {
      representativeName: string;
      representativeActive: boolean;
      categoryName: string;
    })[];
    version: string;
  };
}

function putAccruals(rows: Row[], version: string) {
  return accrualsRoute.request("/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, version }),
  });
}

async function lastEntry() {
  const entries = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "accrual"),
        gt(auditLogTable.id, lastAuditId),
      ),
    )
    .orderBy(auditLogTable.id);
  return entries.at(-1);
}

describe("Tahakkuk", () => {
  it("replaces the list, returns it in order with a new version and records it", async () => {
    const ali = await addRepresentative("Ali");
    const ayse = await addRepresentative("Ayşe");
    const aidat = await addParameter("2027 Aidatı");
    const cleared = await putAccruals([], (await getAccruals()).version);
    expect(cleared.status).toBe(200);
    const empty = (await cleared.json()) as { version: string };

    const rows = [
      { representativeId: ali.id, categoryId: aidat.id, amount: "1000.00" },
      { representativeId: ayse.id, categoryId: aidat.id, amount: "50.25" },
    ];
    const res = await putAccruals(rows, empty.version);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; message: string };
    expect(body.message).toBe("Tahakkuk kaydedildi");
    expect(body.version).not.toBe(empty.version);

    const saved = await getAccruals();
    expect(saved.version).toBe(body.version);
    expect(saved.rows).toMatchObject([
      {
        ...rows[0],
        representativeName: ali.name,
        representativeActive: true,
        categoryName: aidat.name,
      },
      { ...rows[1], representativeName: ayse.name },
    ]);
    const entry = await lastEntry();
    expect(entry).toMatchObject({ action: "update", entityLabel: "Tahakkuk" });
    expect(entry?.changes).toEqual([
      {
        label: "Tahakkuk",
        from: "—",
        to: `${ali.name}: ${aidat.name} 1.000,00 TL, ${ayse.name}: ${aidat.name} 50,25 TL`,
      },
    ]);

    // the same rows again: nothing to record, same version
    const again = await putAccruals(rows, body.version);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { version: string }).version).toBe(
      body.version,
    );
    expect((await lastEntry())?.id).toBe(entry?.id);
  });

  it("changes the version when only the Aidat changes", async () => {
    const ali = await addRepresentative("Aidatı Değişen");
    const first = await addParameter("Birinci");
    const second = await addParameter("İkinci");
    const saved = await putAccruals(
      [{ representativeId: ali.id, categoryId: first.id, amount: "1.00" }],
      (await getAccruals()).version,
    );
    const { version } = (await saved.json()) as { version: string };
    const changed = await putAccruals(
      [{ representativeId: ali.id, categoryId: second.id, amount: "1.00" }],
      version,
    );
    expect(((await changed.json()) as { version: string }).version).not.toBe(
      version,
    );
  });

  it("refuses a save started from an older version", async () => {
    const ali = await addRepresentative("Eski");
    const aidat = await addParameter("Eski Aidat");
    const { version } = await getAccruals();
    const first = await putAccruals(
      [{ representativeId: ali.id, categoryId: aidat.id, amount: "1.00" }],
      version,
    );
    expect(first.status).toBe(200);

    const second = await putAccruals(
      [{ representativeId: ali.id, categoryId: aidat.id, amount: "9.00" }],
      version,
    );
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe(
      "Tahakkuk siz düzenlerken başka biri tarafından değiştirildi. Değişikliklerinizi not alıp sayfayı yenileyin.",
    );
    expect((await getAccruals()).rows).toMatchObject([
      { representativeId: ali.id, amount: "1.00" },
    ]);
  });

  it("refuses a Pasif or unknown yetkili on a new row", async () => {
    const pasif = await addRepresentative("Pasif", false);
    const aidat = await addParameter("Pasif Aidat");
    const { version } = await getAccruals();
    const passive = await putAccruals(
      [{ representativeId: pasif.id, categoryId: aidat.id, amount: "1.00" }],
      version,
    );
    expect(passive.status).toBe(400);
    expect(await passive.json()).toEqual({
      error: "Pasif yetkili eklenemez",
      field: "rows.0.representativeId",
    });

    const unknown = await putAccruals(
      [{ representativeId: 2147483000, categoryId: aidat.id, amount: "1.00" }],
      version,
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      error: "Seçilen yetkili bulunamadı",
      field: "rows.0.representativeId",
    });
  });

  it("needs the Aidat to be a Tahsilat Türü", async () => {
    const ali = await addRepresentative("Yanlış Liste");
    const aidat = await addParameter("Doğru Aidat");
    const method = await addParameter("Nakit", "collection_method");
    const res = await putAccruals(
      [
        { representativeId: ali.id, categoryId: aidat.id, amount: "1.00" },
        { representativeId: ali.id, categoryId: method.id, amount: "1.00" },
      ],
      (await getAccruals()).version,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Seçilen aidat bulunamadı",
      field: "rows.1.categoryId",
    });

    const missing = await accrualsRoute.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [{ representativeId: ali.id, amount: "1.00" }],
        version: (await getAccruals()).version,
      }),
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({
      error: "Aidat seçin",
      field: "rows.0.categoryId",
    });
  });

  it("keeps a yetkili that became Pasif after being saved", async () => {
    const ali = await addRepresentative("Sonra Pasif");
    const aidat = await addParameter("Sonra Aidat");
    const rows = [
      { representativeId: ali.id, categoryId: aidat.id, amount: "5.00" },
    ];
    const saved = await putAccruals(rows, (await getAccruals()).version);
    const { version } = (await saved.json()) as { version: string };
    await db
      .update(authorizedRepresentativeTable)
      .set({ active: false })
      .where(eq(authorizedRepresentativeTable.id, ali.id));

    const res = await putAccruals(
      [
        ...rows,
        { representativeId: ali.id, categoryId: aidat.id, amount: "6.00" },
      ],
      version,
    );
    expect(res.status).toBe(200);
    expect((await getAccruals()).rows).toMatchObject([
      { representativeId: ali.id, representativeActive: false, amount: "5.00" },
      { representativeId: ali.id, amount: "6.00" },
    ]);
  });
});

describe("records a tahakkuk row holds on to", () => {
  it("counts it on the yetkili and refuses to delete them", async () => {
    const ali = await addRepresentative("Silinemez");
    const aidat = await addParameter("Silinemez Aidat");
    const res = await putAccruals(
      [{ representativeId: ali.id, categoryId: aidat.id, amount: "1.00" }],
      (await getAccruals()).version,
    );
    expect(res.status).toBe(200);

    const detail = await (
      await representativesRoute.request(`/${ali.id}`)
    ).json();
    expect(detail.accrualCount).toBe(1);

    const del = await representativesRoute.request(`/${ali.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(409);
    expect(((await del.json()) as { error: string }).error).toBe(
      "Bu yetkiliye ait 1 tahakkuk var. Silmek yerine pasif yapabilirsiniz.",
    );
  });

  it("counts it on the Tahsilat Türü and refuses to delete it", async () => {
    const ali = await addRepresentative("Türü Silinemez");
    const aidat = await addParameter("Kullanılan Aidat");
    const res = await putAccruals(
      [{ representativeId: ali.id, categoryId: aidat.id, amount: "1.00" }],
      (await getAccruals()).version,
    );
    expect(res.status).toBe(200);

    const listed = (
      (await (await parametersRoute.request("/")).json()) as {
        id: number;
        usageCount: number;
      }[]
    ).find((p) => p.id === aidat.id);
    expect(listed?.usageCount).toBe(1);

    const del = await parametersRoute.request(`/${aidat.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(409);
    expect(((await del.json()) as { error: string }).error).toBe(
      "Bu kayıt 1 tahsilat veya tahakkuk kaydında kullanılıyor, silinemez.",
    );

    // empty the list so afterAll can delete the test records
    await putAccruals([], (await getAccruals()).version);
  });
});
