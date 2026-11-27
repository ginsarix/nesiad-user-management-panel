import { and, desc, eq, inArray } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  cashAccountTable,
  collectionTable,
  memberTable,
  parameterTable,
  projectTable,
} from "@/db/schema";
import { todayInIstanbul } from "@/lib/dates";
import type { MemberStatus } from "@/lib/member-status";
import { sumAmounts } from "@/lib/money";
import {
  deleteTestCashAccounts,
  insertTestCashAccount,
} from "@/test/cash-accounts";
import { cashAccountsRoute } from "./cash-accounts";
import { collectionsRoute } from "./collections";

// Kasa - Banka fixtures, deleted after the records using them
const cashAccountIds: number[] = [];

// new tahsilatlar email every panel user; never for real in tests
const mail = vi.hoisted(() => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/mail", () => mail);

const suffix = crypto.randomUUID().slice(0, 8);
const memberIds: number[] = [];
const parameterIds: number[] = [];

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** A __test__ member; `name` is the Adı, Soyadı is the suffix */
async function insertMember(name: string, status: MemberStatus = "active") {
  const [row] = await db
    .insert(memberTable)
    .values({ firstName: name, lastName: suffix, status })
    .returning({ id: memberTable.id });
  memberIds.push(row.id);
  return row.id;
}

async function insertParameter(kind: string, name: string) {
  const [row] = await db
    .insert(parameterTable)
    .values({
      kind: kind as "collection_category",
      name,
      nameKey: name.toLocaleLowerCase("tr"),
    })
    .returning({ id: parameterTable.id });
  parameterIds.push(row.id);
  return row.id;
}

async function insertProject(number: string, active = true) {
  const [row] = await db
    .insert(projectTable)
    .values({
      name: `__test__ Proje ${number}`,
      number,
      numberKey: number.toLocaleLowerCase("tr"),
      active,
    })
    .returning({ id: projectTable.id });
  return row.id;
}

let member: number;
let pasifMember: number;
let aidat: number;
let bagis: number;
let kasa: number;
let banka: number;
let pasifKasa: number;
let odemeTuru: number;
let projectA: number;
let pasifProject: number;

beforeAll(async () => {
  member = await insertMember("__test__ Üye");
  pasifMember = await insertMember("__test__ Pasif Üye", "passive");
  aidat = await insertParameter(
    "collection_category",
    `__test__ Aidat ${suffix}`,
  );
  bagis = await insertParameter(
    "collection_category",
    `__test__ Bağış ${suffix}`,
  );
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
  odemeTuru = await insertParameter(
    "payment_category",
    `__test__ Havale ${suffix}`,
  );
  projectA = await insertProject(`__test__A-${suffix}`);
  pasifProject = await insertProject(`__test__P-${suffix}`, false);
});

afterAll(async () => {
  if (memberIds.length) {
    await db
      .delete(collectionTable)
      .where(inArray(collectionTable.memberId, memberIds));
    await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
  }
  // every project this file made has "__test__" and the suffix in its number
  const projects = await db.select().from(projectTable);
  const mine = projects.filter((p) => p.number.includes(suffix));
  if (mine.length) {
    await db.delete(projectTable).where(
      inArray(
        projectTable.id,
        mine.map((p) => p.id),
      ),
    );
  }
  if (parameterIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, parameterIds));
  }
  await deleteTestCashAccounts(cashAccountIds);
});

function valid(overrides: Record<string, unknown> = {}) {
  return {
    memberId: member,
    categoryId: aidat,
    cashAccountId: kasa,
    amount: "1250.50",
    date: "2026-11-01",
    note: "",
    project: { mode: "none" },
    ...overrides,
  };
}

async function create(overrides: Record<string, unknown> = {}) {
  const res = await collectionsRoute.request(
    "/",
    json("POST", valid(overrides)),
  );
  return { res, body: await res.json() };
}

async function patch(id: number, overrides: Record<string, unknown> = {}) {
  return collectionsRoute.request(`/${id}`, json("PATCH", valid(overrides)));
}

async function getOne(id: number) {
  return (await collectionsRoute.request(`/${id}`)).json();
}

async function list(query: string) {
  return (await (await collectionsRoute.request(`/?${query}`)).json()) as {
    collections: { id: number; amount: string }[];
    count: number;
  };
}

/** What the page shows as Toplam: the rows' amounts, summed in kuruş */
function totalOf({ collections }: Awaited<ReturnType<typeof list>>) {
  return sumAmounts(collections.map((collection) => collection.amount));
}

async function lastEntry(entityType: string, action: string, id: number) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, entityType),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

async function balanceOf(cashAccountId: number) {
  const res = await cashAccountsRoute.request(`/${cashAccountId}`);
  return ((await res.json()) as { balance: string }).balance;
}

async function projectByNumber(number: string) {
  const [row] = await db
    .select()
    .from(projectTable)
    .where(eq(projectTable.numberKey, number.toLocaleLowerCase("tr")));
  return row;
}

describe("POST /api/collections", () => {
  it("creates a tahsilat without a project and records it", async () => {
    const { res, body } = await create({ note: " Ekim aidatı " });
    expect(res.status).toBe(201);
    expect(body.projectId).toBeNull();

    expect(await getOne(body.id)).toEqual({
      id: body.id,
      date: "2026-11-01",
      amount: "1250.50",
      note: "Ekim aidatı",
      memberId: member,
      memberName: `__test__ Üye ${suffix}`,
      categoryId: aidat,
      categoryName: `__test__ Aidat ${suffix}`,
      cashAccountId: kasa,
      cashAccountName: `__test__ Kasa ${suffix}`,
      projectId: null,
      projectName: null,
      projectNumber: null,
    });

    const entry = await lastEntry("collection", "create", body.id);
    expect(entry.entityLabel).toBe(
      `__test__ Üye ${suffix} · ₺1.250,50 · 01.11.2026`,
    );
    expect(entry.details).toEqual([
      { label: "Üye", value: `__test__ Üye ${suffix}` },
      { label: "Tutar", value: "₺1.250,50" },
      { label: "Tarih", value: "01.11.2026" },
      { label: "Tahsilat Türü", value: `__test__ Aidat ${suffix}` },
      { label: "Kasa - Banka", value: `__test__ Kasa ${suffix}` },
      { label: "Proje", value: "—" },
      { label: "Not", value: "Ekim aidatı" },
    ]);
  });

  it("links an existing Aktif project", async () => {
    const { res, body } = await create({
      project: { mode: "existing", id: projectA },
    });
    expect(res.status).toBe(201);
    expect(await getOne(body.id)).toMatchObject({
      projectId: projectA,
      projectNumber: `__test__A-${suffix}`,
    });
  });

  it("creates a new project with the tahsilat in one go", async () => {
    const number = `__test__N-${suffix}`;
    const { res, body } = await create({
      project: {
        mode: "new",
        name: " __test__ Yeni Kreş ",
        number,
        active: true,
      },
    });
    expect(res.status).toBe(201);

    const project = await projectByNumber(number);
    expect(project).toMatchObject({ name: "__test__ Yeni Kreş", active: true });
    expect(body.projectId).toBe(project.id);
    expect(await lastEntry("project", "create", project.id)).toBeDefined();
    expect(
      (await lastEntry("collection", "create", body.id)).details,
    ).toContainEqual({
      label: "Proje",
      value: `__test__ Yeni Kreş (${number})`,
    });
  });

  it("creates nothing when the tahsilat is invalid", async () => {
    const zero = `__test__Z-${suffix}`;
    const badAmount = await create({
      amount: "0.00",
      project: { mode: "new", name: "X", number: zero, active: true },
    });
    expect(badAmount.res.status).toBe(400);
    expect(await projectByNumber(zero)).toBeUndefined();

    const wrongList = `__test__W-${suffix}`;
    const badMethod = await create({
      cashAccountId: pasifKasa,
      project: { mode: "new", name: "X", number: wrongList, active: true },
    });
    expect(badMethod.res.status).toBe(400);
    expect(await projectByNumber(wrongList)).toBeUndefined();
  });

  it("reports a duplicate project number under the project field", async () => {
    const before = (await list(`member=${member}`)).count;
    const { res, body } = await create({
      project: {
        mode: "new",
        name: "Kopya",
        number: ` __TEST__a-${suffix} `,
        active: true,
      },
    });
    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Bu proje numarası zaten var",
      field: "project.number",
    });
    expect((await list(`member=${member}`)).count).toBe(before);
  });

  it("validates a new project's fields under the project field", async () => {
    const { res, body } = await create({
      project: { mode: "new", name: "", number: "x", active: true },
    });
    expect(res.status).toBe(400);
    expect(body).toEqual({
      error: "Proje adı boş olamaz",
      field: "project.name",
    });
  });

  it.each(["memberId", "categoryId", "cashAccountId", "amount", "date"])(
    "requires %s",
    async (field) => {
      const { res } = await create({ [field]: undefined });
      expect(res.status).toBe(400);
    },
  );

  it.each(["0.00", "-1.00", "1,5"])("rejects the amount %s", async (amount) => {
    expect((await create({ amount })).res.status).toBe(400);
  });

  it("rejects a future date", async () => {
    const tomorrow = todayInIstanbul(new Date(Date.now() + 86_400_000));
    const { res, body } = await create({ date: tomorrow });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Tarih gelecekte olamaz");
  });

  it("rejects parameters from the wrong list", async () => {
    const category = await create({ categoryId: odemeTuru });
    expect(category.res.status).toBe(400);
    expect(category.body).toEqual({
      error: "Geçerli bir tahsilat türü seçin",
      field: "categoryId",
    });
  });

  it("needs an Aktif Kasa - Banka", async () => {
    const pasif = await create({ cashAccountId: pasifKasa });
    expect(pasif.res.status).toBe(400);
    expect(pasif.body).toEqual({
      error: "Seçilen Kasa - Banka aktif değil",
      field: "cashAccountId",
    });
    const unknown = await create({ cashAccountId: 2147483000 });
    expect(unknown.res.status).toBe(400);
    expect(unknown.body).toEqual({
      error: "Seçilen Kasa - Banka bulunamadı",
      field: "cashAccountId",
    });
  });

  it("new tahsilat refuses an Aday, Reddedildi or Pasif member", async () => {
    const aday = await insertMember("__test__ Aday Üye", "candidate");
    const reddedildi = await insertMember(
      "__test__ Reddedilen Üye",
      "rejected",
    );
    for (const id of [aday, reddedildi, pasifMember]) {
      const refused = await create({ memberId: id });
      expect(refused.res.status).toBe(400);
      expect(refused.body).toEqual({
        error: "Seçilen üye aktif değil",
        field: "memberId",
      });
    }
    const unknown = await create({ memberId: 2147483000 });
    expect(unknown.body).toEqual({
      error: "Seçilen üye bulunamadı",
      field: "memberId",
    });
  });

  it("refuses a Pasif project on create", async () => {
    const project = await create({
      project: { mode: "existing", id: pasifProject },
    });
    expect(project.body).toEqual({
      error: "Seçilen proje aktif değil",
      field: "project.id",
    });
  });
});

describe("PATCH /api/collections/:id", () => {
  it("keeps a Kasa - Banka that became Pasif, refuses another", async () => {
    const closing = await insertTestCashAccount(
      `__test__ Kapanan ${suffix}`,
      cashAccountIds,
    );
    const { body } = await create({ cashAccountId: closing });
    await db
      .update(cashAccountTable)
      .set({ active: false })
      .where(eq(cashAccountTable.id, closing));

    const keep = await patch(body.id, {
      cashAccountId: closing,
      amount: "5.00",
    });
    expect(keep.status).toBe(200);
    const other = await patch(body.id, { cashAccountId: pasifKasa });
    expect(other.status).toBe(400);
  });

  it("adds to the Bakiye, following edits and deletes", async () => {
    const account = await insertTestCashAccount(
      `__test__ Bakiye ${suffix}`,
      cashAccountIds,
      { openingBalance: "1000.00" },
    );
    const { body } = await create({ cashAccountId: account, amount: "250.00" });
    expect(await balanceOf(account)).toBe("1250.00");

    await patch(body.id, { cashAccountId: account, amount: "300.00" });
    expect(await balanceOf(account)).toBe("1300.00");

    await collectionsRoute.request(`/${body.id}`, { method: "DELETE" });
    expect(await balanceOf(account)).toBe("1000.00");
  });

  it("moves its amount when it moves to another Kasa - Banka", async () => {
    const from = await insertTestCashAccount(
      `__test__ Eski Hesap ${suffix}`,
      cashAccountIds,
    );
    const to = await insertTestCashAccount(
      `__test__ Yeni Hesap ${suffix}`,
      cashAccountIds,
    );
    const { body } = await create({ cashAccountId: from, amount: "40.00" });
    expect(await balanceOf(from)).toBe("40.00");

    await patch(body.id, { cashAccountId: to, amount: "40.00" });
    expect(await balanceOf(from)).toBe("0.00");
    expect(await balanceOf(to)).toBe("40.00");
    expect((await lastEntry("collection", "update", body.id)).changes).toEqual([
      {
        label: "Kasa - Banka",
        from: `__test__ Eski Hesap ${suffix}`,
        to: `__test__ Yeni Hesap ${suffix}`,
      },
    ]);
  });

  it("editing a tahsilat keeps its member after it became Pasif", async () => {
    const leaving = await insertMember("__test__ Ayrılan");
    const { body } = await create({ memberId: leaving });
    await db
      .update(memberTable)
      .set({ status: "passive" })
      .where(eq(memberTable.id, leaving));

    const res = await patch(body.id, { memberId: leaving, amount: "99.00" });
    expect(res.status).toBe(200);
    expect(await getOne(body.id)).toMatchObject({
      memberId: leaving,
      memberName: `__test__ Ayrılan ${suffix}`,
      amount: "99.00",
    });
  });

  it("refuses another Pasif member on edit", async () => {
    const { body } = await create();
    const res = await patch(body.id, { memberId: pasifMember });
    expect(res.status).toBe(400);
  });

  it("keeps a project that became Pasif, refuses another", async () => {
    const closing = await insertProject(`__test__C-${suffix}`);
    const { body } = await create({
      project: { mode: "existing", id: closing },
    });
    await db
      .update(projectTable)
      .set({ active: false })
      .where(eq(projectTable.id, closing));

    const keep = await patch(body.id, {
      amount: "5.00",
      project: { mode: "existing", id: closing },
    });
    expect(keep.status).toBe(200);
    const other = await patch(body.id, {
      project: { mode: "existing", id: pasifProject },
    });
    expect(other.status).toBe(400);
  });

  it("records the changed fields, project names included", async () => {
    const { body } = await create();
    const res = await patch(body.id, {
      amount: "99.00",
      project: { mode: "existing", id: projectA },
    });
    expect(res.status).toBe(200);
    expect((await lastEntry("collection", "update", body.id)).changes).toEqual([
      { label: "Tutar", from: "₺1.250,50", to: "₺99,00" },
      {
        label: "Proje",
        from: "—",
        to: `__test__ Proje __test__A-${suffix} (__test__A-${suffix})`,
      },
    ]);
  });

  it("can create and link a new project on edit", async () => {
    const { body } = await create();
    const number = `__test__E-${suffix}`;
    const res = await patch(body.id, {
      project: { mode: "new", name: "__test__ Sonradan", number, active: true },
    });
    expect(res.status).toBe(200);
    expect((await getOne(body.id)).projectNumber).toBe(number);
  });

  it("records nothing when nothing changed", async () => {
    const { body } = await create();
    await patch(body.id);
    expect(await lastEntry("collection", "update", body.id)).toBeUndefined();
  });
});

describe("GET /api/collections", () => {
  it("filters by proje, Projesiz and member, summing kuruş exactly", async () => {
    const payer = await insertMember("__test__ Ödeyen");
    const first = await create({
      memberId: payer,
      amount: "0.10",
      date: "2026-10-01",
      project: { mode: "existing", id: projectA },
    });
    const second = await create({
      memberId: payer,
      amount: "0.20",
      date: "2026-10-15",
      categoryId: bagis,
      cashAccountId: banka,
    });
    const third = await create({
      memberId: payer,
      amount: "100.00",
      date: "2026-11-01",
      project: { mode: "existing", id: projectA },
    });

    const all = await list(`member=${payer}`);
    expect(all).not.toHaveProperty("total");
    expect(totalOf(all)).toBe("100.30");
    expect(all.collections.map((c) => c.id)).toEqual([
      third.body.id,
      second.body.id,
      first.body.id,
    ]);

    const none = await list(`member=${payer}&project=none`);
    expect(none.count).toBe(1);
    expect(totalOf(none)).toBe("0.20");

    const withA = await list(`member=${payer}&project=${projectA}`);
    expect(totalOf(withA)).toBe("100.10");
    expect(withA.collections.map((c) => c.id)).toEqual([
      third.body.id,
      first.body.id,
    ]);

    const byAccount = await list(`member=${payer}&cashAccount=${banka}`);
    expect(byAccount.collections.map((c) => c.id)).toEqual([second.body.id]);
  });
});

describe("DELETE /api/collections/:id", () => {
  it("deletes and records the whole record", async () => {
    const { body } = await create();
    const res = await collectionsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await collectionsRoute.request(`/${body.id}`)).status).toBe(404);
    expect(
      (await lastEntry("collection", "delete", body.id)).details,
    ).toContainEqual({ label: "Tutar", value: "₺1.250,50" });
  });

  it("404s for an unknown tahsilat", async () => {
    const res = await collectionsRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/collections/export", () => {
  it("exports the filtered tahsilatlar with real cells and a total", async () => {
    const payer = await insertMember("__test__ Excel");
    for (const [amount, date, project] of [
      ["0.10", "2026-10-01", { mode: "existing", id: projectA }],
      ["0.20", "2026-10-15", { mode: "none" }],
      ["100.00", "2026-11-01", { mode: "none" }],
    ] as const) {
      await create({ memberId: payer, amount, date, project });
    }

    const res = await collectionsRoute.request(
      `/export?member=${payer}&from=2026-10-01&to=2026-10-15`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="tahsilatlar-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );

    const rows = await readSheet(Buffer.from(await res.arrayBuffer()));
    expect(rows[0]).toEqual([
      "Tarih",
      "Üye",
      "Tutar",
      "Tahsilat Türü",
      "Kasa - Banka",
      "Proje",
      "Not",
    ]);
    expect(rows[1][0]).toEqual(new Date("2026-10-15T00:00:00Z"));
    expect(rows[1][1]).toBe(`__test__ Excel ${suffix}`);
    expect(rows[1][2]).toBe(0.2);
    expect(rows[1][4]).toBe(`__test__ Kasa ${suffix}`);
    expect(rows[1][5]).toBeNull();
    expect(rows[2][2]).toBe(0.1);
    expect(rows[2][5]).toBe(
      `__test__ Proje __test__A-${suffix} (__test__A-${suffix})`,
    );
    const total = rows[rows.length - 1];
    expect(total[0]).toBe("Toplam");
    expect(total[2]).toBeCloseTo(0.3, 10);
    expect(rows).toHaveLength(5); // header, 2 tahsilatlar, blank, total
  });
});

describe("notices for a new tahsilat", () => {
  async function noticeEntries(id: number) {
    return db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "collection"),
          eq(auditLogTable.action, "collection_notice"),
          eq(auditLogTable.entityId, String(id)),
        ),
      );
  }

  it("sends them after the tahsilat is saved and records only outcomes", async () => {
    const { body } = await create();
    await vi.waitFor(async () => {
      expect(await noticeEntries(body.id)).toHaveLength(1);
    });

    const [entry] = await noticeEntries(body.id);
    expect(entry.entityLabel).toBe(
      `__test__ Üye ${suffix} · ₺1.250,50 · 01.11.2026`,
    );
    const labels = entry.details?.map((d) => d.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Üye e-posta",
        "Üye SMS",
        "Panel kullanıcıları e-posta",
        "Panel kullanıcıları SMS",
      ]),
    );
    // the member in this file has no e-mail or mobile number
    expect(entry.details).toContainEqual({
      label: "Üye e-posta",
      value: "Adres yok",
    });
    expect(JSON.stringify(entry.details)).not.toContain("@");
  });

  it("sends nothing when a tahsilat is edited", async () => {
    const { body } = await create();
    await vi.waitFor(async () => {
      expect(await noticeEntries(body.id)).toHaveLength(1);
    });

    await patch(body.id, { amount: "7.00" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await noticeEntries(body.id)).toHaveLength(1);
  });
});
