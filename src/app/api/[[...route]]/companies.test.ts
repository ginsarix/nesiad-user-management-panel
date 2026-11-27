import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { companyTable, memberTable } from "@/db/schema";
import { companiesRoute } from "./companies";
import {
  applyMemberCompany,
  CompanyNotFoundError,
  deleteCompanyIfOrphaned,
} from "./company-writes";

const companyIds: number[] = [];
const memberIds: number[] = [];
const suffix = crypto.randomUUID().slice(0, 8);

afterAll(async () => {
  if (memberIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
  }
  if (companyIds.length) {
    await db.delete(companyTable).where(inArray(companyTable.id, companyIds));
  }
});

async function insertCompany(title: string, logo: string | null = null) {
  const [row] = await db
    .insert(companyTable)
    .values({ title, titleKey: title.toLocaleLowerCase("tr"), logo })
    .returning({ id: companyTable.id });
  companyIds.push(row.id);
  return row.id;
}

async function insertMember(firstName: string, companyId: number | null) {
  const [row] = await db
    .insert(memberTable)
    .values({ firstName, lastName: "", companyId, legacyTitle: firstName })
    .returning({ id: memberTable.id });
  memberIds.push(row.id);
  return row.id;
}

describe("companies API", () => {
  it("lists companies with member counts", async () => {
    const id = await insertCompany(`__test__ Liste ${suffix}`);
    await insertMember(`__test__ A ${suffix}`, id);
    await insertMember(`__test__ B ${suffix}`, id);

    const res = await companiesRoute.request("/");
    const list = (await res.json()) as {
      id: number;
      title: string;
      memberCount: number;
    }[];
    expect(list.find((c) => c.id === id)).toMatchObject({
      title: `__test__ Liste ${suffix}`,
      memberCount: 2,
    });
  });

  it("returns a company with its members", async () => {
    const id = await insertCompany(`__test__ Detay ${suffix}`);
    const memberId = await insertMember(`__test__ C ${suffix}`, id);

    const res = await companiesRoute.request(`/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe(`__test__ Detay ${suffix}`);
    expect(body.sectorName).toBeNull();
    expect(body.members).toEqual([
      { id: memberId, name: `__test__ C ${suffix}`, status: "active" },
    ]);

    expect((await companiesRoute.request("/2147483000")).status).toBe(404);
  });
});

describe("applyMemberCompany", () => {
  it("applyMemberCompany creates a new company", async () => {
    const result = await db.transaction((tx) =>
      applyMemberCompany(
        tx,
        {
          mode: "new",
          fields: { title: `__test__ Yeni ${suffix}`, address: "Adres 1" },
        },
        null,
      ),
    );
    expect(result.createdCompany).toBe(true);
    expect(result.companyId).not.toBeNull();
    companyIds.push(result.companyId as number);

    const [row] = await db
      .select()
      .from(companyTable)
      .where(eq(companyTable.id, result.companyId as number));
    expect(row.title).toBe(`__test__ Yeni ${suffix}`);
    expect(row.address).toBe("Adres 1");
    expect(row.titleKey).toBe(`__test__ yeni ${suffix}`);

    const none = await db.transaction((tx) =>
      applyMemberCompany(tx, { mode: "none" }, result.companyId),
    );
    expect(none).toEqual({
      companyId: null,
      changes: [],
      createdCompany: false,
    });
  });

  it("applyMemberCompany updates an existing company and reports Firma changes", async () => {
    const id = await insertCompany(`__test__ Eski ${suffix}`);

    const result = await db.transaction((tx) =>
      applyMemberCompany(
        tx,
        {
          mode: "existing",
          id,
          fields: {
            title: `__test__ Yeni Ad ${suffix}`,
            phone: "0384 111",
            employeeCount: 12,
          },
        },
        id,
      ),
    );
    expect(result.companyId).toBe(id);
    expect(result.createdCompany).toBe(false);
    expect(result.changes.map((c) => c.label).sort()).toEqual(
      ["Firma: Telefon", "Firma: Çalışan Sayısı", "Firma: Ünvan"].sort(),
    );
    expect(result.changes).toContainEqual({
      label: "Firma: Ünvan",
      from: `__test__ Eski ${suffix}`,
      to: `__test__ Yeni Ad ${suffix}`,
    });

    const [row] = await db
      .select()
      .from(companyTable)
      .where(eq(companyTable.id, id));
    expect(row.title).toBe(`__test__ Yeni Ad ${suffix}`);
    expect(row.titleKey).toBe(`__test__ yeni ad ${suffix}`);
    expect(row.employeeCount).toBe(12);

    // the same values again change nothing
    const again = await db.transaction((tx) =>
      applyMemberCompany(
        tx,
        { mode: "existing", id, fields: { phone: "0384 111" } },
        id,
      ),
    );
    expect(again.changes).toEqual([]);
  });

  it("rejects an existing company id that doesn't exist", async () => {
    await expect(
      db.transaction((tx) =>
        applyMemberCompany(
          tx,
          {
            mode: "existing",
            id: 2147483000,
            fields: { title: `__test__ Yok ${suffix}` },
          },
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});

describe("deleteCompanyIfOrphaned", () => {
  it("deleteCompanyIfOrphaned keeps a company that still has members", async () => {
    const id = await insertCompany(`__test__ Kalan ${suffix}`, "logo.png");
    await insertMember(`__test__ D ${suffix}`, id);

    const result = await db.transaction((tx) =>
      deleteCompanyIfOrphaned(tx, id),
    );
    expect(result).toEqual({ deleted: false, files: [] });
    const rows = await db
      .select()
      .from(companyTable)
      .where(eq(companyTable.id, id));
    expect(rows).toHaveLength(1);
  });

  it("deleteCompanyIfOrphaned deletes an orphaned company and its files", async () => {
    const id = await insertCompany(`__test__ Yetim ${suffix}`, "logo.png");
    await db
      .update(companyTable)
      .set({ logoOriginal: "logo.pdf", activityDocument: "faaliyet.pdf" })
      .where(eq(companyTable.id, id));

    const result = await db.transaction((tx) =>
      deleteCompanyIfOrphaned(tx, id),
    );
    expect(result.deleted).toBe(true);
    expect(result.files.sort()).toEqual(
      ["faaliyet.pdf", "logo.pdf", "logo.png"].sort(),
    );
    const rows = await db
      .select()
      .from(companyTable)
      .where(eq(companyTable.id, id));
    expect(rows).toHaveLength(0);
  });
});
