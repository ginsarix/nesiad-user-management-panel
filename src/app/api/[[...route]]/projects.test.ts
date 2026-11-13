import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  authorizedRepresentativeTable,
  collectionTable,
  parameterTable,
  projectPledgeTable,
  projectTable,
} from "@/db/schema";
import { projectsRoute } from "./projects";

const createdIds: number[] = [];

const representativeIds: number[] = [];
const parameterIds: number[] = [];

afterAll(async () => {
  if (representativeIds.length) {
    await db
      .delete(collectionTable)
      .where(inArray(collectionTable.representativeId, representativeIds));
  }
  // before the yetkililer: their taahhütler go with the projeler
  if (createdIds.length) {
    await db.delete(projectTable).where(inArray(projectTable.id, createdIds));
  }
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

/** A __test__ yetkili, inserted directly */
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

/** Two tahsilatlar (100.00 and 50.25) for the project, inserted directly */
async function addCollections(projectId: number) {
  const [representative] = await db
    .insert(authorizedRepresentativeTable)
    .values({ name: `__test__ Yetkili ${projectId}` })
    .returning({ id: authorizedRepresentativeTable.id });
  representativeIds.push(representative.id);
  const parameters = await db
    .insert(parameterTable)
    .values([
      {
        kind: "collection_category" as const,
        name: `__test__ Tür ${projectId}`,
        nameKey: `__test__ tür ${projectId}`,
      },
      {
        kind: "collection_method" as const,
        name: `__test__ Tip ${projectId}`,
        nameKey: `__test__ tip ${projectId}`,
      },
    ])
    .returning({ id: parameterTable.id });
  parameterIds.push(...parameters.map((p) => p.id));
  await db.insert(collectionTable).values(
    ["100.00", "50.25"].map((amount) => ({
      representativeId: representative.id,
      categoryId: parameters[0].id,
      methodId: parameters[1].id,
      amount,
      date: "2026-11-01",
      projectId,
    })),
  );
}

// Proje Numarası is unique; keep this file's apart from parallel runs
const suffix = crypto.randomUUID().slice(0, 8);

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function createProject(fields: Record<string, unknown>) {
  const res = await projectsRoute.request(
    "/",
    json("POST", { active: true, ...fields }),
  );
  const body = await res.json();
  if (res.status === 201) createdIds.push(body.id);
  return { res, body };
}

async function lastEntry(action: string, id: number) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "project"),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

describe("POST /api/projects", () => {
  it("creates a trimmed project and records it", async () => {
    const { res, body } = await createProject({
      name: " __test__ Kreş ",
      number: ` PR-${suffix} `,
    });
    expect(res.status).toBe(201);

    expect(await (await projectsRoute.request(`/${body.id}`)).json()).toEqual({
      id: body.id,
      name: "__test__ Kreş",
      number: `PR-${suffix}`,
      active: true,
      collectionCount: 0,
      pledges: [],
    });
    expect((await lastEntry("create", body.id)).details).toEqual([
      { label: "Ad", value: "__test__ Kreş" },
      { label: "Proje Numarası", value: `PR-${suffix}` },
      { label: "Durum", value: "Aktif" },
      { label: "Taahhütler", value: "—" },
    ]);
  });

  it("requires a name and a number", async () => {
    const noName = await createProject({ name: " ", number: `N-${suffix}` });
    expect(noName.res.status).toBe(400);
    expect(noName.body).toEqual({
      error: "Proje adı boş olamaz",
      field: "name",
    });

    const noNumber = await createProject({ name: "__test__ X", number: "" });
    expect(noNumber.res.status).toBe(400);
    expect(noNumber.body).toEqual({
      error: "Proje numarası boş olamaz",
      field: "number",
    });
  });

  it("rejects a number differing only in case or spaces", async () => {
    await createProject({ name: "__test__ Bir", number: `DUP-${suffix}` });
    const { res, body } = await createProject({
      name: "__test__ İki",
      number: ` dup-${suffix}`,
    });
    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Bu proje numarası zaten var",
      field: "number",
    });
  });
});

describe("project numbers with I", () => {
  it("treats I, ı, İ and i as the same letter in a number", async () => {
    await createProject({ name: "__test__ I Bir", number: `PRJ-I-${suffix}` });
    for (const number of [
      `prj-i-${suffix}`,
      `PRJ-İ-${suffix}`,
      `prj-ı-${suffix}`,
    ]) {
      const { res } = await createProject({ name: "__test__ I İki", number });
      expect(res.status).toBe(409);
    }
  });
});

describe("GET /api/projects", () => {
  it("lists by number with tahsilat counts", async () => {
    const { body } = await createProject({
      name: "__test__ Liste",
      number: `L-${suffix}`,
    });
    const listed = (
      (await (await projectsRoute.request("/")).json()) as { id: number }[]
    ).find((p) => p.id === body.id);
    expect(listed).toMatchObject({
      collectionCount: 0,
      totalCollected: "0.00",
    });
  });
});

describe("project number order", () => {
  it("sorts numbers inside the code by value: 2 before 10", async () => {
    const ids: number[] = [];
    for (const n of ["10", "2", "9"]) {
      ids.push(
        (
          await createProject({
            name: "__test__ Sıra",
            number: `SR-${suffix}-${n}`,
          })
        ).body.id,
      );
    }
    const listed = (
      (await (await projectsRoute.request("/")).json()) as {
        id: number;
        number: string;
      }[]
    ).filter((p) => ids.includes(p.id));
    expect(listed.map((p) => p.number)).toEqual([
      `SR-${suffix}-2`,
      `SR-${suffix}-9`,
      `SR-${suffix}-10`,
    ]);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("records only changed fields", async () => {
    const fields = { name: "__test__ Durum", number: `D-${suffix}` };
    const { body } = await createProject(fields);

    const res = await projectsRoute.request(
      `/${body.id}`,
      json("PATCH", { ...fields, active: false }),
    );
    expect(res.status).toBe(200);
    expect((await lastEntry("update", body.id)).changes).toEqual([
      { label: "Durum", from: "Aktif", to: "Pasif" },
    ]);
  });

  it("records nothing when nothing changed", async () => {
    const fields = {
      name: "__test__ Aynı",
      number: `A-${suffix}`,
      active: true,
    };
    const { body } = await createProject(fields);
    await projectsRoute.request(`/${body.id}`, json("PATCH", fields));
    expect(await lastEntry("update", body.id)).toBeUndefined();
  });

  it("rejects another project's number", async () => {
    await createProject({ name: "__test__ Üç", number: `U-${suffix}` });
    const { body } = await createProject({
      name: "__test__ Dört",
      number: `V-${suffix}`,
    });
    const res = await projectsRoute.request(
      `/${body.id}`,
      json("PATCH", {
        name: "__test__ Dört",
        number: `u-${suffix}`,
        active: true,
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("deletes and records the whole record", async () => {
    const { body } = await createProject({
      name: "__test__ Silinecek",
      number: `S-${suffix}`,
    });
    const res = await projectsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await projectsRoute.request(`/${body.id}`)).status).toBe(404);
    expect((await lastEntry("delete", body.id)).details).toContainEqual({
      label: "Proje Numarası",
      value: `S-${suffix}`,
    });
  });
});

describe("projects with tahsilatlar", () => {
  it("counts tahsilatlar and refuses to delete the project", async () => {
    const { body } = await createProject({
      name: "__test__ Dolu",
      number: `T-${suffix}`,
    });
    await addCollections(body.id);

    const listed = (
      (await (await projectsRoute.request("/")).json()) as { id: number }[]
    ).find((p) => p.id === body.id);
    expect(listed).toMatchObject({
      collectionCount: 2,
      totalCollected: "150.25",
    });
    expect(
      await (await projectsRoute.request(`/${body.id}`)).json(),
    ).toMatchObject({ collectionCount: 2 });

    const res = await projectsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu projeye ait 2 tahsilat var. Silmek yerine pasif yapabilirsiniz.",
    );
    expect((await projectsRoute.request(`/${body.id}`)).status).toBe(200);
  });
});

describe("unknown project", () => {
  it("404s for GET, PATCH and DELETE", async () => {
    expect((await projectsRoute.request("/2147483000")).status).toBe(404);
    const patch = await projectsRoute.request(
      "/2147483000",
      json("PATCH", {
        name: "__test__ Yok",
        number: `Y-${suffix}`,
        active: true,
      }),
    );
    expect(patch.status).toBe(404);
    const del = await projectsRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(del.status).toBe(404);
  });
});

describe("taahhütler", () => {
  async function getPledges(id: number) {
    const body = await (await projectsRoute.request(`/${id}`)).json();
    return body.pledges as {
      representativeId: number;
      representativeName: string;
      representativeActive: boolean;
      quantity: number;
      amount: string;
    }[];
  }

  function putPledges(id: number, pledges: unknown[]) {
    return projectsRoute.request(`/${id}/pledges`, json("PUT", { pledges }));
  }

  it("saves them with a new proje, in order, and records them", async () => {
    const ali = await addRepresentative("Ali");
    const ayse = await addRepresentative("Ayşe");
    const { res, body } = await createProject({
      name: "__test__ Taahhüt",
      number: `TA-${suffix}`,
      pledges: [
        { representativeId: ali.id, quantity: 2, amount: "1000.00" },
        { representativeId: ayse.id, quantity: 1, amount: "50.25" },
      ],
    });
    expect(res.status).toBe(201);

    expect(await getPledges(body.id)).toMatchObject([
      {
        representativeId: ali.id,
        representativeName: ali.name,
        representativeActive: true,
        quantity: 2,
        amount: "1000.00",
      },
      { representativeId: ayse.id, quantity: 1, amount: "50.25" },
    ]);
    expect((await lastEntry("create", body.id)).details).toContainEqual({
      label: "Taahhütler",
      value: `${ali.name}: 2 × 1.000,00 TL, ${ayse.name}: 1 × 50,25 TL`,
    });
  });

  it("refuses a Pasif or unknown yetkili on a new row", async () => {
    const pasif = await addRepresentative("Pasif", false);
    const passive = await createProject({
      name: "__test__ Pasifli",
      number: `TP-${suffix}`,
      pledges: [{ representativeId: pasif.id, quantity: 1, amount: "10.00" }],
    });
    expect(passive.res.status).toBe(400);
    expect(passive.body).toEqual({
      error: "Pasif yetkili eklenemez",
      field: "pledges.0.representativeId",
    });

    const aktif = await addRepresentative("Aktif");
    const unknown = await createProject({
      name: "__test__ Bilinmeyen",
      number: `TU-${suffix}`,
      pledges: [
        { representativeId: aktif.id, quantity: 1, amount: "10.00" },
        { representativeId: 2147483000, quantity: 1, amount: "10.00" },
      ],
    });
    expect(unknown.res.status).toBe(400);
    expect(unknown.body).toEqual({
      error: "Seçilen yetkili bulunamadı",
      field: "pledges.1.representativeId",
    });
  });

  it("keeps them on a PATCH without pledges", async () => {
    const ali = await addRepresentative("Patch Ali");
    const fields = { name: "__test__ Yama", number: `TY-${suffix}` };
    const { body } = await createProject({
      ...fields,
      pledges: [{ representativeId: ali.id, quantity: 3, amount: "5.00" }],
    });

    const res = await projectsRoute.request(
      `/${body.id}`,
      json("PATCH", { ...fields, active: false }),
    );
    expect(res.status).toBe(200);
    expect(await getPledges(body.id)).toHaveLength(1);
    expect((await lastEntry("update", body.id)).changes).toEqual([
      { label: "Durum", from: "Aktif", to: "Pasif" },
    ]);
  });

  it("replaces them on a PATCH with pledges and records the change", async () => {
    const ali = await addRepresentative("Değişen Ali");
    const fields = {
      name: "__test__ Değişen",
      number: `TD-${suffix}`,
      active: true,
    };
    const { body } = await createProject({
      ...fields,
      pledges: [{ representativeId: ali.id, quantity: 1, amount: "5.00" }],
    });

    const res = await projectsRoute.request(
      `/${body.id}`,
      json("PATCH", {
        ...fields,
        pledges: [{ representativeId: ali.id, quantity: 2, amount: "5.00" }],
      }),
    );
    expect(res.status).toBe(200);
    expect((await lastEntry("update", body.id)).changes).toEqual([
      {
        label: "Taahhütler",
        from: `${ali.name}: 1 × 5,00 TL`,
        to: `${ali.name}: 2 × 5,00 TL`,
      },
    ]);
  });

  it("keeps a yetkili that became Pasif after being saved", async () => {
    const ali = await addRepresentative("Sonra Pasif");
    const fields = {
      name: "__test__ Sonra Pasif",
      number: `TS-${suffix}`,
      active: true,
    };
    const pledges = [{ representativeId: ali.id, quantity: 1, amount: "5.00" }];
    const { body } = await createProject({ ...fields, pledges });
    await db
      .update(authorizedRepresentativeTable)
      .set({ active: false })
      .where(eq(authorizedRepresentativeTable.id, ali.id));

    const patch = await projectsRoute.request(
      `/${body.id}`,
      json("PATCH", { ...fields, pledges }),
    );
    expect(patch.status).toBe(200);
    expect((await putPledges(body.id, pledges)).status).toBe(200);
    expect(await getPledges(body.id)).toMatchObject([
      { representativeId: ali.id, representativeActive: false },
    ]);
  });

  it("PUT replaces only the taahhütler and records changes once", async () => {
    const ali = await addRepresentative("Put Ali");
    const { body } = await createProject({
      name: "__test__ Put",
      number: `TQ-${suffix}`,
    });
    const pledges = [
      { representativeId: ali.id, quantity: 4, amount: "12.50" },
      { representativeId: ali.id, quantity: 1, amount: "1.00" },
    ];

    const res = await putPledges(body.id, pledges);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: body.id,
      message: "Taahhütler kaydedildi",
    });
    expect(await getPledges(body.id)).toMatchObject(pledges);
    const entry = await lastEntry("update", body.id);
    expect(entry.changes).toEqual([
      {
        label: "Taahhütler",
        from: "—",
        to: `${ali.name}: 4 × 12,50 TL, ${ali.name}: 1 × 1,00 TL`,
      },
    ]);

    // the same rows again: nothing to record
    expect((await putPledges(body.id, pledges)).status).toBe(200);
    expect((await lastEntry("update", body.id)).id).toBe(entry.id);
  });

  it("PUT refuses bad rows and an unknown proje", async () => {
    const ali = await addRepresentative("Kötü Ali");
    const { body } = await createProject({
      name: "__test__ Kötü",
      number: `TK-${suffix}`,
    });
    const zero = await putPledges(body.id, [
      { representativeId: ali.id, quantity: 0, amount: "1.00" },
    ]);
    expect(zero.status).toBe(400);
    expect(await zero.json()).toEqual({
      error: "Adet en az 1 olmalı",
      field: "pledges.0.quantity",
    });

    expect((await putPledges(2147483000, [])).status).toBe(404);
  });

  it("go with a deleted proje, named in its audit entry", async () => {
    const ali = await addRepresentative("Silinen Ali");
    const { body } = await createProject({
      name: "__test__ Silinen Taahhüt",
      number: `TX-${suffix}`,
      pledges: [{ representativeId: ali.id, quantity: 1, amount: "7.00" }],
    });

    const res = await projectsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(
      await db.$count(
        projectPledgeTable,
        eq(projectPledgeTable.projectId, body.id),
      ),
    ).toBe(0);
    expect((await lastEntry("delete", body.id)).details).toContainEqual({
      label: "Taahhütler",
      value: `${ali.name}: 1 × 7,00 TL`,
    });
  });
});
