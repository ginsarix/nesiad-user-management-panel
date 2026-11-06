import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogTable, memberTable, sectorTable } from "@/db/schema";
import { membersRoute } from "./members";
import { representativesRoute } from "./representatives";
import { sectorsRoute } from "./sectors";

const memberIds: number[] = [];
const sectorIds: number[] = [];

afterAll(async () => {
  if (memberIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
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

async function createMember(fields: Record<string, string>) {
  const res = await membersRoute.request("/", {
    method: "POST",
    body: form(fields),
  });
  const { id } = await res.json();
  memberIds.push(id);
  return id as number;
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
    const id = await createMember({
      title: "__test__ Denetim Üyesi",
      phone: "0384 111",
      memberLoginDate: "2014-03-05",
      sectorId: String(insaat),
    });

    await membersRoute.request(`/${id}`, {
      method: "PATCH",
      body: form({
        title: "__test__ Denetim Üyesi",
        phone: "0384 222",
        memberLoginDate: "2015-01-02",
        sectorId: String(gida),
      }),
    });

    const row = await lastEntry("member", "update", id);
    expect(row.actorId).toBeNull(); // no session in route tests: "Sistem"
    expect(row.changes).toEqual([
      { label: "Telefon", from: "0384 111", to: "0384 222" },
      { label: "Üye Giriş Tarihi", from: "05.03.2014", to: "02.01.2015" },
      {
        label: "Sektör",
        from: `__test__ İnşaat ${suffix}`,
        to: `__test__ Gıda ${suffix}`,
      },
    ]);
  });

  it("audits status changes as display labels, nothing for a no-op", async () => {
    const id = await createMember({ title: "__test__ Durum Denetimi" });

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

  it("keeps a deleted member's details, including its yetkililer", async () => {
    const id = await createMember({ title: "__test__ Silinecek Üye" });
    const res = await representativesRoute.request(
      "/",
      json("POST", {
        name: "__test__ Ali Veli",
        members: [{ memberId: id, role: "Ortak" }],
      }),
    );
    const representative = await res.json();

    await membersRoute.request(`/${id}`, { method: "DELETE" });

    const row = await lastEntry("member", "delete", id);
    expect(row.entityLabel).toBe("__test__ Silinecek Üye");
    expect(row.details).toContainEqual({
      label: "Yetkililer",
      value: "__test__ Ali Veli (Ortak)",
    });

    await representativesRoute.request(`/${representative.id}`, {
      method: "DELETE",
    });
    expect(
      (await lastEntry("representative", "delete", representative.id)).details,
    ).toContainEqual({ label: "Bağlı Üyeler", value: "—" });
  });

  it("names the members a deleted sector is cleared from", async () => {
    const sectorId = await createSector("__test__ Silinecek Sektör");
    await createMember({
      title: "__test__ Sektörlü Üye",
      sectorId: String(sectorId),
    });

    await sectorsRoute.request(`/${sectorId}`, { method: "DELETE" });

    expect((await lastEntry("sector", "delete", sectorId)).details).toEqual([
      { label: "Sektör Adı", value: `__test__ Silinecek Sektör ${suffix}` },
      { label: "Sektörü boşaltılan üyeler", value: "__test__ Sektörlü Üye" },
    ]);
  });
});
