import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  companyTable,
  memberTable,
  sectorTable,
} from "@/db/schema";
import { membersRoute } from "./members";
import { sectorsRoute } from "./sectors";

const memberIds: number[] = [];
const companyIds: number[] = [];
const sectorIds: number[] = [];

afterAll(async () => {
  if (memberIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
  }
  if (companyIds.length) {
    await db.delete(companyTable).where(inArray(companyTable.id, companyIds));
  }
  if (sectorIds.length) {
    await db.delete(sectorTable).where(inArray(sectorTable.id, sectorIds));
  }
});

function form(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return body;
}

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// sector names are unique and other test files use similar ones in parallel
const suffix = crypto.randomUUID().slice(0, 8);

async function createSector(name: string) {
  const res = await sectorsRoute.request(
    "/",
    json("POST", { name: `${name} ${suffix}` }),
  );
  const { id } = await res.json();
  sectorIds.push(id);
  return id as number;
}

/** A member through the route; `company` is the Firma section's JSON */
async function createMember(fields: Record<string, string>) {
  const res = await membersRoute.request("/", {
    method: "POST",
    body: form({ firstName: "__test__", lastName: "Denetim", ...fields }),
  });
  const { id } = await res.json();
  memberIds.push(id);
  const member = await (await membersRoute.request(`/${id}`)).json();
  if (member.company) companyIds.push(member.company.id);
  return { id: id as number, companyId: member.company?.id as number };
}

function newCompany(title: string, fields: Record<string, string> = {}) {
  return JSON.stringify({ mode: "new", fields: { title, ...fields } });
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

describe("audit log of panel data", () => {
  it("records a member's changed fields as display values", async () => {
    const insaat = await createSector("__test__ İnşaat");
    const gida = await createSector("__test__ Gıda");
    const { id, companyId } = await createMember({
      memberLoginDate: "2014-03-05",
      company: newCompany("__test__ Denetim Firması", {
        phone: "0384 111",
        sectorId: String(insaat),
      }),
    });

    await membersRoute.request(`/${id}`, {
      method: "PATCH",
      body: form({
        lastName: "Denetlendi",
        memberLoginDate: "2015-01-02",
        company: JSON.stringify({
          mode: "existing",
          id: companyId,
          fields: {
            title: "__test__ Denetim Firması",
            phone: "0384 222",
            sectorId: String(gida),
          },
        }),
      }),
    });

    const row = await lastEntry("member", "update", id);
    expect(row.actorId).toBeNull(); // no session in route tests: "Sistem"
    expect(row.entityLabel).toBe("__test__ Denetlendi");
    expect(row.changes).toEqual([
      { label: "Soyadı", from: "Denetim", to: "Denetlendi" },
      { label: "Üye Giriş Tarihi", from: "05.03.2014", to: "02.01.2015" },
      { label: "Firma: Telefon", from: "0384 111", to: "0384 222" },
      {
        label: "Firma: Sektör",
        from: `__test__ İnşaat ${suffix}`,
        to: `__test__ Gıda ${suffix}`,
      },
    ]);
  });

  it("audits status changes as display labels, nothing for a no-op", async () => {
    const { id } = await createMember({});

    await membersRoute.request(`/${id}`, {
      method: "PATCH",
      body: form({ status: "passive" }),
    });
    expect((await lastEntry("member", "update", id)).changes).toEqual([
      { label: "Durum", from: "Aktif", to: "Pasif" },
    ]);

    // only this member's rows: other test files write in parallel
    const ownRows = () =>
      db.$count(
        auditLogTable,
        and(
          eq(auditLogTable.entityType, "member"),
          eq(auditLogTable.entityId, String(id)),
        ),
      );
    const before = await ownRows();
    await membersRoute.request(`/${id}`, {
      method: "PATCH",
      body: form({ status: "passive" }),
    });
    expect(await ownRows()).toBe(before);
  });

  it("keeps a deleted member's details, including its company", async () => {
    const { id } = await createMember({
      lastName: "Silinecek",
      companyRole: "Ortak",
      company: newCompany("__test__ Silinecek Firma"),
    });

    await membersRoute.request(`/${id}`, { method: "DELETE" });

    const row = await lastEntry("member", "delete", id);
    expect(row.entityLabel).toBe("__test__ Silinecek");
    expect(row.details).toEqual(
      expect.arrayContaining([
        { label: "Görev", value: "Ortak" },
        { label: "Firma: Ünvan", value: "__test__ Silinecek Firma" },
      ]),
    );
  });

  it("names the companies a deleted sector is cleared from", async () => {
    const sectorId = await createSector("__test__ Silinecek Sektör");
    await createMember({
      company: newCompany("__test__ Sektörlü Firma", {
        sectorId: String(sectorId),
      }),
    });

    await sectorsRoute.request(`/${sectorId}`, { method: "DELETE" });

    expect((await lastEntry("sector", "delete", sectorId)).details).toEqual([
      { label: "Sektör Adı", value: `__test__ Silinecek Sektör ${suffix}` },
      {
        label: "Sektörü boşaltılan firmalar",
        value: "__test__ Sektörlü Firma",
      },
    ]);
  });
});
