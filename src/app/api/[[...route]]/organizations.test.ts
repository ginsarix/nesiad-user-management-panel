import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  committeeTable,
  managementBoardTable,
  memberTable,
  parameterTable,
} from "@/db/schema";
import { organizationsRoute } from "./organizations";

// group names are unique per page; keep this file's apart from parallel runs
const suffix = crypto.randomUUID().slice(0, 8);

const committeeIds: number[] = [];
const managementBoardIds: number[] = [];
const memberIds: number[] = [];
const parameterIds: number[] = [];

let ahmet: { id: number; name: string };
let ayse: { id: number; name: string };
let pasif: { id: number; name: string };
let aday: { id: number; name: string };
let baskan: { id: number; name: string };
let uye: { id: number; name: string };
let nakit: { id: number; name: string };

beforeAll(async () => {
  const members = await db
    .insert(memberTable)
    .values([
      { firstName: "__test__ Ahmet", lastName: suffix },
      { firstName: "__test__ Ayşe", lastName: suffix },
      { firstName: "__test__ Pasif", lastName: suffix, status: "passive" },
      { firstName: "__test__ Aday", lastName: suffix, status: "candidate" },
    ])
    .returning({ id: memberTable.id });
  memberIds.push(...members.map((m) => m.id));
  [ahmet, ayse, pasif, aday] = members.map((m, i) => ({
    id: m.id,
    name: `__test__ ${["Ahmet", "Ayşe", "Pasif", "Aday"][i]} ${suffix}`,
  }));

  const parameters = await db
    .insert(parameterTable)
    .values(
      (
        [
          ["association_role", `__test__ Başkan ${suffix}`],
          ["association_role", `__test__ Üye ${suffix}`],
          ["payment_category", `__test__ Nakit ${suffix}`],
        ] as const
      ).map(([kind, name]) => ({
        kind,
        name,
        nameKey: name.toLocaleLowerCase("tr"),
      })),
    )
    .returning({ id: parameterTable.id, name: parameterTable.name });
  parameterIds.push(...parameters.map((p) => p.id));
  [baskan, uye, nakit] = parameters;
});

afterAll(async () => {
  if (committeeIds.length) {
    await db
      .delete(committeeTable)
      .where(inArray(committeeTable.id, committeeIds));
  }
  if (managementBoardIds.length) {
    await db
      .delete(managementBoardTable)
      .where(inArray(managementBoardTable.id, managementBoardIds));
  }
  await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
  await db
    .delete(parameterTable)
    .where(inArray(parameterTable.id, parameterIds));
});

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

type Person = { memberId: number; roleId: number };

async function createGroup(
  name: string,
  people: Person[],
  slug = "committees",
) {
  const res = await organizationsRoute.request(
    `/${slug}`,
    json("POST", { name, people }),
  );
  const body = await res.json();
  if (res.status === 201) {
    (slug === "committees" ? committeeIds : managementBoardIds).push(body.id);
  }
  return { res, body };
}

async function getGroup(id: number) {
  const res = await organizationsRoute.request(`/committees/${id}`);
  return { res, body: await res.json() };
}

async function auditEntries(action: string, id: number) {
  return db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "committee"),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id));
}

describe("POST /api/organizations/:organization", () => {
  it("creates a group with people in order", async () => {
    const name = `__test__ Eğitim ${suffix}`;
    const { res, body } = await createGroup(name, [
      { memberId: ahmet.id, roleId: baskan.id },
      { memberId: ayse.id, roleId: uye.id },
    ]);
    expect(res.status).toBe(201);

    const group = await getGroup(body.id);
    expect(group.body).toMatchObject({
      id: body.id,
      name,
      people: [
        {
          memberId: ahmet.id,
          memberName: ahmet.name,
          memberActive: true,
          roleId: baskan.id,
          roleName: baskan.name,
        },
        {
          memberId: ayse.id,
          memberName: ayse.name,
          memberActive: true,
          roleId: uye.id,
          roleName: uye.name,
        },
      ],
    });

    const [entry] = await auditEntries("create", body.id);
    expect(entry.entityLabel).toBe(name);
    expect(entry.details).toEqual([
      { label: "İsim", value: name },
      {
        label: "Kişiler",
        value: `${ahmet.name}: ${baskan.name}, ${ayse.name}: ${uye.name}`,
      },
    ]);
  });

  it("allows the same member twice", async () => {
    const { res, body } = await createGroup(`__test__ İkili ${suffix}`, [
      { memberId: ahmet.id, roleId: baskan.id },
      { memberId: ahmet.id, roleId: uye.id },
    ]);
    expect(res.status).toBe(201);
    expect((await getGroup(body.id)).body.people).toHaveLength(2);
  });

  it("creates a group without people", async () => {
    const { res } = await createGroup(`__test__ Boş ${suffix}`, []);
    expect(res.status).toBe(201);
  });

  it("requires a name", async () => {
    const { res, body } = await createGroup("   ", []);
    expect(res.status).toBe(400);
    expect(body.error).toBe("İsim boş olamaz");
  });

  it("refuses a name used in the same organization, ignoring Turkish case", async () => {
    const first = await createGroup(`__test__ İŞ Komitesi ${suffix}`, []);
    expect(first.res.status).toBe(201);

    const again = await createGroup(`__test__ iş komitesi ${suffix}`, []);
    expect(again.res.status).toBe(409);
    expect(again.body).toEqual({
      error: "Bu isimde bir kayıt zaten var",
      field: "name",
    });

    const elsewhere = await createGroup(
      `__test__ İŞ Komitesi ${suffix}`,
      [],
      "management-boards",
    );
    expect(elsewhere.res.status).toBe(201);
  });

  it("refuses a görev from another list", async () => {
    const name = `__test__ Yanlış Görev ${suffix}`;
    const { res, body } = await createGroup(name, [
      { memberId: ahmet.id, roleId: nakit.id },
    ]);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Seçilen görev bulunamadı");

    const list = await organizationsRoute.request("/committees");
    const groups = (await list.json()) as { name: string }[];
    expect(groups.some((g) => g.name === name)).toBe(false);
  });

  it("refuses an unknown member", async () => {
    const { res, body } = await createGroup(`__test__ Bilinmeyen ${suffix}`, [
      { memberId: 2147483000, roleId: baskan.id },
    ]);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Seçilen üye bulunamadı");
  });

  it("refuses an Aday member", async () => {
    const { res, body } = await createGroup(`__test__ Adaylı ${suffix}`, [
      { memberId: aday.id, roleId: uye.id },
    ]);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Aktif olmayan üye eklenemez");
  });

  it("refuses a Pasif member not already in the group", async () => {
    const { res, body } = await createGroup(`__test__ Pasifli ${suffix}`, [
      { memberId: pasif.id, roleId: uye.id },
    ]);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Aktif olmayan üye eklenemez");
  });
});

describe("GET /api/organizations/:organization", () => {
  it("lists groups with their person count", async () => {
    const name = `__test__ Sayılı ${suffix}`;
    const { body } = await createGroup(name, [
      { memberId: ahmet.id, roleId: baskan.id },
      { memberId: ahmet.id, roleId: uye.id },
    ]);

    const res = await organizationsRoute.request("/committees");
    expect(res.status).toBe(200);
    const groups = (await res.json()) as unknown[];
    expect(groups).toContainEqual({ id: body.id, name, personCount: 2 });
  });

  it("rejects an unknown organization", async () => {
    const res = await organizationsRoute.request("/nope");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Geçersiz organizasyon" });
  });

  it("answers 404 for a missing group", async () => {
    const res = await organizationsRoute.request("/committees/2147483000");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Kayıt bulunamadı" });
  });
});

describe("PATCH /api/organizations/:organization/:id", () => {
  it("keeps a member that became Pasif", async () => {
    const [temp] = await db
      .insert(memberTable)
      .values({ firstName: "__test__ Sonra Pasif", lastName: suffix })
      .returning({ id: memberTable.id });
    memberIds.push(temp.id);

    const people = [{ memberId: temp.id, roleId: baskan.id }];
    const { body } = await createGroup(`__test__ Değişen ${suffix}`, people);

    await db
      .update(memberTable)
      .set({ status: "passive" })
      .where(eq(memberTable.id, temp.id));

    const name = `__test__ Değişen ${suffix}`;
    const same = await organizationsRoute.request(
      `/committees/${body.id}`,
      json("PATCH", { name, people }),
    );
    expect(same.status).toBe(200);

    // matched by member, so a second row for them is fine too
    const twice = await organizationsRoute.request(
      `/committees/${body.id}`,
      json("PATCH", {
        name,
        people: [...people, { memberId: temp.id, roleId: uye.id }],
      }),
    );
    expect(twice.status).toBe(200);

    const group = await getGroup(body.id);
    expect(group.body.people).toHaveLength(2);
    expect(group.body.people[0].memberActive).toBe(false);
  });

  it("refuses a Pasif member not already in the group", async () => {
    const { body } = await createGroup(`__test__ Pasif Ekleme ${suffix}`, []);
    const res = await organizationsRoute.request(
      `/committees/${body.id}`,
      json("PATCH", {
        name: `__test__ Pasif Ekleme ${suffix}`,
        people: [{ memberId: pasif.id, roleId: uye.id }],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Aktif olmayan üye eklenemez");
  });

  it("records only what changed", async () => {
    const name = `__test__ Kayıtlı ${suffix}`;
    const people = [{ memberId: ahmet.id, roleId: baskan.id }];
    const { body } = await createGroup(name, people);

    const unchanged = await organizationsRoute.request(
      `/committees/${body.id}`,
      json("PATCH", { name, people }),
    );
    expect(unchanged.status).toBe(200);
    expect(await auditEntries("update", body.id)).toHaveLength(0);

    await organizationsRoute.request(
      `/committees/${body.id}`,
      json("PATCH", {
        name,
        people: [{ memberId: ahmet.id, roleId: uye.id }],
      }),
    );
    const updates = await auditEntries("update", body.id);
    expect(updates).toHaveLength(1);
    expect(updates[0].changes).toEqual([
      {
        label: "Kişiler",
        from: `${ahmet.name}: ${baskan.name}`,
        to: `${ahmet.name}: ${uye.name}`,
      },
    ]);
  });

  it("answers 404 for a missing group", async () => {
    const res = await organizationsRoute.request(
      "/committees/2147483000",
      json("PATCH", { name: `__test__ Yok ${suffix}`, people: [] }),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/organizations/:organization/:id", () => {
  it("deletes a group with its people", async () => {
    const name = `__test__ Silinen ${suffix}`;
    const { body } = await createGroup(name, [
      { memberId: ayse.id, roleId: uye.id },
    ]);

    const res = await organizationsRoute.request(`/committees/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await getGroup(body.id)).res.status).toBe(404);

    const [entry] = await auditEntries("delete", body.id);
    expect(entry.details).toEqual([
      { label: "İsim", value: name },
      { label: "Kişiler", value: `${ayse.name}: ${uye.name}` },
    ]);
  });
});
