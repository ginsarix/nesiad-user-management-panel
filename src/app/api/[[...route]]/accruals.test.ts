import { and, eq, gt, inArray, max } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  accrualTable,
  auditLogTable,
  authorizedRepresentativeTable,
} from "@/db/schema";
import { accrualsRoute } from "./accruals";
import { representativesRoute } from "./representatives";

// There is one Tahakkuk list and tests run on the development database:
// keep its rows and put them back afterwards. Every test touching the
// accrual table lives in this file, so they never run in parallel.
let savedRows: (typeof accrualTable.$inferSelect)[] = [];
let lastAuditId = 0;
const representativeIds: number[] = [];
const suffix = crypto.randomUUID().slice(0, 8);

beforeAll(async () => {
  savedRows = await db.select().from(accrualTable);
  const [row] = await db
    .select({ id: max(auditLogTable.id) })
    .from(auditLogTable);
  lastAuditId = row?.id ?? 0;
});

afterAll(async () => {
  await db.delete(accrualTable);
  if (savedRows.length) {
    await db.insert(accrualTable).overridingSystemValue().values(savedRows);
  }
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

type Row = { representativeId: number; quantity: number; amount: string };

async function getAccruals() {
  return (await (await accrualsRoute.request("/")).json()) as {
    rows: (Row & {
      representativeName: string;
      representativeActive: boolean;
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
  const [entry] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "accrual"),
        gt(auditLogTable.id, lastAuditId),
      ),
    )
    .orderBy(auditLogTable.id)
    .then((rows) => rows.slice(-1));
  return entry;
}

describe("Tahakkuk", () => {
  it("replaces the list, returns it in order with a new version and records it", async () => {
    const ali = await addRepresentative("Ali");
    const ayse = await addRepresentative("Ayşe");
    const before = await getAccruals();
    // start from an empty list
    const cleared = await putAccruals([], before.version);
    expect(cleared.status).toBe(200);
    const empty = (await cleared.json()) as { version: string };

    const rows = [
      { representativeId: ali.id, quantity: 2, amount: "1000.00" },
      { representativeId: ayse.id, quantity: 1, amount: "50.25" },
    ];
    const res = await putAccruals(rows, empty.version);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; message: string };
    expect(body.message).toBe("Tahakkuk kaydedildi");
    expect(body.version).not.toBe(empty.version);

    const saved = await getAccruals();
    expect(saved.version).toBe(body.version);
    expect(saved.rows).toMatchObject([
      { ...rows[0], representativeName: ali.name, representativeActive: true },
      { ...rows[1], representativeName: ayse.name },
    ]);
    const entry = await lastEntry();
    expect(entry).toMatchObject({ action: "update", entityLabel: "Tahakkuk" });
    expect(entry.changes).toEqual([
      {
        label: "Tahakkuk",
        from: "—",
        to: `${ali.name}: 2 × 1.000,00 TL, ${ayse.name}: 1 × 50,25 TL`,
      },
    ]);

    // the same rows again: nothing to record, same version
    const again = await putAccruals(rows, body.version);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { version: string }).version).toBe(
      body.version,
    );
    expect((await lastEntry()).id).toBe(entry.id);
  });

  it("refuses a save started from an older version", async () => {
    const ali = await addRepresentative("Eski");
    const { version } = await getAccruals();
    const first = await putAccruals(
      [{ representativeId: ali.id, quantity: 1, amount: "1.00" }],
      version,
    );
    expect(first.status).toBe(200);

    const second = await putAccruals(
      [{ representativeId: ali.id, quantity: 9, amount: "9.00" }],
      version,
    );
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe(
      "Tahakkuk siz düzenlerken başka biri tarafından değiştirildi. Değişikliklerinizi not alıp sayfayı yenileyin.",
    );
    expect((await getAccruals()).rows).toMatchObject([
      { representativeId: ali.id, quantity: 1, amount: "1.00" },
    ]);
  });

  it("refuses a Pasif or unknown yetkili on a new row", async () => {
    const pasif = await addRepresentative("Pasif", false);
    const { version } = await getAccruals();
    const passive = await putAccruals(
      [{ representativeId: pasif.id, quantity: 1, amount: "1.00" }],
      version,
    );
    expect(passive.status).toBe(400);
    expect(await passive.json()).toEqual({
      error: "Pasif yetkili eklenemez",
      field: "rows.0.representativeId",
    });

    const unknown = await putAccruals(
      [{ representativeId: 2147483000, quantity: 1, amount: "1.00" }],
      version,
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      error: "Seçilen yetkili bulunamadı",
      field: "rows.0.representativeId",
    });
  });

  it("keeps a yetkili that became Pasif after being saved", async () => {
    const ali = await addRepresentative("Sonra Pasif");
    const rows = [{ representativeId: ali.id, quantity: 1, amount: "5.00" }];
    const saved = await putAccruals(rows, (await getAccruals()).version);
    const { version } = (await saved.json()) as { version: string };
    await db
      .update(authorizedRepresentativeTable)
      .set({ active: false })
      .where(eq(authorizedRepresentativeTable.id, ali.id));

    const res = await putAccruals(
      [...rows, { representativeId: ali.id, quantity: 2, amount: "5.00" }],
      version,
    );
    expect(res.status).toBe(200);
    expect((await getAccruals()).rows).toMatchObject([
      { representativeId: ali.id, representativeActive: false, quantity: 1 },
      { representativeId: ali.id, quantity: 2 },
    ]);
  });

  it("validates rows like Taahhütler", async () => {
    const ali = await addRepresentative("Sıfır");
    const res = await putAccruals(
      [{ representativeId: ali.id, quantity: 0, amount: "1.00" }],
      (await getAccruals()).version,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Adet en az 1 olmalı",
      field: "rows.0.quantity",
    });
  });
});

describe("yetkililer with tahakkuk rows", () => {
  it("counts them and refuses to delete the yetkili", async () => {
    const ali = await addRepresentative("Silinemez");
    const res = await putAccruals(
      [{ representativeId: ali.id, quantity: 1, amount: "1.00" }],
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

    // empty the list so afterAll can delete the yetkili
    await putAccruals([], (await getAccruals()).version);
  });
});
