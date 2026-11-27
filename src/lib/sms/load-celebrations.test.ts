import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { companyTable, memberTable } from "@/db/schema";
import { loadCelebrationsOn } from "./load-celebrations";

const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const memberIds: number[] = [];
const companyIds: number[] = [];

afterAll(async () => {
  if (memberIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
  }
  if (companyIds.length) {
    await db.delete(companyTable).where(inArray(companyTable.id, companyIds));
  }
});

async function createCompany(foundingDate: string | null, phone: string) {
  const title = `__test__ Kutlama Firma ${tag}-${companyIds.length}`;
  const [row] = await db
    .insert(companyTable)
    .values({
      title,
      titleKey: title.toLocaleLowerCase("tr"),
      foundingDate,
      phone,
    })
    .returning({ id: companyTable.id });
  companyIds.push(row.id);
  return row.id;
}

async function createMember(values: Partial<typeof memberTable.$inferInsert>) {
  const [row] = await db
    .insert(memberTable)
    .values({
      firstName: `__test__ Kutlama ${tag}`,
      lastName: "Üye",
      mobilePhone: "0532 000 00 11",
      ...values,
    })
    .returning({ id: memberTable.id });
  memberIds.push(row.id);
  return row.id;
}

const ours = <T extends { contact: { id: number; kind: string } }>(
  list: T[],
  kind: string,
  ids: number[],
) => list.filter((c) => c.contact.kind === kind && ids.includes(c.contact.id));

describe("loadCelebrationsOn", () => {
  it("birthday SMS go to Aktif members", async () => {
    const active = await createMember({ birthDate: "1980-02-28" });
    const passive = await createMember({
      birthDate: "1980-02-28",
      status: "passive",
    });
    const noBirthDate = await createMember({});

    const list = await loadCelebrationsOn("2027-02-28");
    const found = ours(list, "member", [active, passive, noBirthDate]);

    expect(found).toEqual([
      {
        kind: "birthday",
        contact: {
          kind: "member",
          id: active,
          name: `__test__ Kutlama ${tag} Üye`,
          phone: "0532 000 00 11",
        },
        date: "1980-02-28",
        years: 47,
        phone: { ok: true, phone: "5320000011" },
      },
    ]);
  });

  it("Aday members get no birthday SMS", async () => {
    const candidate = await createMember({
      birthDate: "1980-02-28",
      status: "candidate",
    });
    const rejected = await createMember({
      birthDate: "1980-02-28",
      status: "rejected",
    });
    const list = await loadCelebrationsOn("2027-02-28");
    expect(ours(list, "member", [candidate, rejected])).toEqual([]);
  });

  it("a company with two Aktif members gets one founding SMS", async () => {
    const company = await createCompany("2012-02-29", "0384 213 11 11");
    await createMember({ companyId: company });
    await createMember({ companyId: company });

    const list = await loadCelebrationsOn("2027-02-28");
    const found = ours(list, "company", [company]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "founding",
      contact: { kind: "company", id: company, phone: "0384 213 11 11" },
      date: "2012-02-29",
      years: 15,
    });
  });

  it("a company with only Pasif members gets none", async () => {
    const company = await createCompany("2012-02-29", "0532 000 00 12");
    await createMember({ companyId: company, status: "passive" });
    await createMember({ companyId: company, status: "candidate" });
    const empty = await createCompany("2012-02-29", "0532 000 00 13");

    const list = await loadCelebrationsOn("2027-02-28");
    expect(ours(list, "company", [company, empty])).toEqual([]);
  });
});
