import { readdir } from "node:fs/promises";
import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  authorizedRepresentativeTable,
  committeeMemberTable,
  committeeTable,
  memberTable,
  parameterTable,
  supervisoryBoardTable,
} from "@/db/schema";
import { deleteFile, getFilePath, readStoredFile } from "@/lib/file-storage";
import type { MemberStatus } from "@/lib/member-status";
import { membersRoute } from "./members";
import { organizationsRoute } from "./organizations";
import { representativesRoute } from "./representatives";

const createdRepresentativeIds: number[] = [];
const createdMemberIds: number[] = [];
const committeeIds: number[] = [];
const supervisoryBoardIds: number[] = [];
const parameterIds: number[] = [];
const createdFiles: string[] = [];

// group and parameter names are unique; keep them apart from parallel runs
const suffix = crypto.randomUUID().slice(0, 8);

afterAll(async () => {
  if (committeeIds.length) {
    await db
      .delete(committeeTable)
      .where(inArray(committeeTable.id, committeeIds));
  }
  if (supervisoryBoardIds.length) {
    await db
      .delete(supervisoryBoardTable)
      .where(inArray(supervisoryBoardTable.id, supervisoryBoardIds));
  }
  if (createdRepresentativeIds.length) {
    await db
      .delete(authorizedRepresentativeTable)
      .where(
        inArray(authorizedRepresentativeTable.id, createdRepresentativeIds),
      );
  }
  if (createdMemberIds.length) {
    await db
      .delete(memberTable)
      .where(inArray(memberTable.id, createdMemberIds));
  }
  if (parameterIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, parameterIds));
  }
  await Promise.all(createdFiles.map(deleteFile));
});

async function createRole(name: string) {
  const [role] = await db
    .insert(parameterTable)
    .values({
      kind: "association_role",
      name,
      nameKey: name.toLocaleLowerCase("tr"),
    })
    .returning({ id: parameterTable.id, name: parameterTable.name });
  parameterIds.push(role.id);
  return role;
}

async function createGroup(
  slug: "committees" | "supervisory-boards",
  name: string,
  people: { representativeId: number; roleId: number }[],
) {
  const res = await organizationsRoute.request(
    `/${slug}`,
    json("POST", { name, people }),
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: number };
  (slug === "committees" ? committeeIds : supervisoryBoardIds).push(id);
  return id;
}

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function form(fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return body;
}

/** The yetkili route takes multipart: links as JSON text, booleans as text */
function representativeForm(body: Record<string, unknown>) {
  const fields: Record<string, string | File> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value instanceof File || typeof value === "string") fields[key] = value;
    else if (key === "members") fields[key] = JSON.stringify(value);
    else fields[key] = String(value);
  }
  return form(fields);
}

async function createMember(title: string, status: MemberStatus = "active") {
  const [member] = await db
    .insert(memberTable)
    .values({ title, status })
    .returning({ id: memberTable.id });
  createdMemberIds.push(member.id);
  return member.id;
}

async function createRepresentative(body: Record<string, unknown>) {
  const res = await representativesRoute.request("/", {
    method: "POST",
    body: representativeForm(body),
  });
  const resBody = await res.json();
  if (res.status === 201) createdRepresentativeIds.push(resBody.id);
  return { res, body: resBody };
}

async function getRepresentative(id: number) {
  const res = await representativesRoute.request(`/${id}`);
  return { res, body: await res.json() };
}

function patch(id: number, body: Record<string, unknown>) {
  return representativesRoute.request(`/${id}`, {
    method: "PATCH",
    body: representativeForm(body),
  });
}

describe("POST /api/representatives", () => {
  it("creates a yetkili with blank fields stored as null", async () => {
    const { res, body } = await createRepresentative({
      name: "  __test__ Ayşe Yılmaz  ",
      phone: "",
      email: "",
      notes: "",
      dateOfBirth: "",
    });
    expect(res.status).toBe(201);

    const { body: representative } = await getRepresentative(body.id);
    expect(representative).toMatchObject({
      name: "__test__ Ayşe Yılmaz",
      phone: null,
      email: null,
      notes: null,
      dateOfBirth: null,
      active: true,
      members: [],
    });
  });

  it("links members with their görev, sorted by title", async () => {
    const zeytin = await createMember("__test__ Zeytin A.Ş.");
    const cam = await createMember("__test__ Çam Ltd.");
    const { body } = await createRepresentative({
      name: "__test__ Mehmet Kaya",
      phone: "0532 123 45 67",
      email: "mehmet@example.com",
      dateOfBirth: "1975-06-01",
      members: [
        { memberId: zeytin, role: "Ortak" },
        { memberId: cam, role: "  Genel Müdür " },
      ],
    });

    const { body: representative } = await getRepresentative(body.id);
    expect(
      representative.members.map((m: { title: string; role: string }) => [
        m.title,
        m.role,
      ]),
    ).toEqual([
      ["__test__ Çam Ltd.", "Genel Müdür"],
      ["__test__ Zeytin A.Ş.", "Ortak"],
    ]);

    // the member side sees the yetkili and their görev too
    const member = await (await membersRoute.request(`/${cam}`)).json();
    expect(member.representatives).toEqual([
      {
        id: body.id,
        name: "__test__ Mehmet Kaya",
        photo: null,
        phone: "0532 123 45 67",
        active: true,
        role: "Genel Müdür",
      },
    ]);
  });

  it("requires a name", async () => {
    const { res, body } = await createRepresentative({ name: " " });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Ad soyad boş olamaz");
  });

  it("rejects an invalid email", async () => {
    const { res, body } = await createRepresentative({
      name: "__test__ E-posta",
      email: "yanlis-adres",
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Geçerli bir e-posta adresi girin");
  });

  it("rejects a members field that isn't JSON", async () => {
    const res = await representativesRoute.request("/", {
      method: "POST",
      body: form({ name: "__test__ Bozuk Liste", members: "[{" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Geçersiz üye listesi");
  });

  it("rejects the same member twice", async () => {
    const memberId = await createMember("__test__ Tekrar");
    const { res, body } = await createRepresentative({
      name: "__test__ Tekrarlı",
      members: [{ memberId }, { memberId }],
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Aynı üye birden fazla seçilemez");
  });

  it.each(["candidate", "rejected"] as const)(
    "refuses linking a %s member and saves nothing",
    async (status) => {
      const memberId = await createMember(`__test__ ${status} Üye`, status);
      const name = `__test__ Aday Bağlantı ${crypto.randomUUID()}`;
      const { res, body } = await createRepresentative({
        name,
        members: [{ memberId }],
      });
      expect(res.status).toBe(400);
      expect(body.error).toBe("Aday veya reddedilmiş üyeye yetkili bağlanamaz");

      const all = await (await representativesRoute.request("/")).json();
      expect(all.some((r: { name: string }) => r.name === name)).toBe(false);
      const member = await (await membersRoute.request(`/${memberId}`)).json();
      expect(member.representatives).toEqual([]);
    },
  );

  it("rejects a member that doesn't exist and saves nothing", async () => {
    const name = `__test__ Olmayan Üye ${crypto.randomUUID()}`;
    const { res, body } = await createRepresentative({
      name,
      members: [{ memberId: 2147483000 }],
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Seçilen üye bulunamadı");

    // by name: other test files add yetkililer in parallel
    const all = await (await representativesRoute.request("/")).json();
    expect(all.some((r: { name: string }) => r.name === name)).toBe(false);
  });
});

describe("PATCH /api/representatives/:id", () => {
  it("replaces the member links when sent", async () => {
    const first = await createMember("__test__ İlk Üye");
    const second = await createMember("__test__ İkinci Üye");
    const { body } = await createRepresentative({
      name: "__test__ Bağlantı",
      members: [{ memberId: first, role: "Ortak" }],
    });

    const res = await patch(body.id, {
      members: [{ memberId: second, role: "Müdür" }],
    });
    expect(res.status).toBe(200);

    const { body: representative } = await getRepresentative(body.id);
    expect(
      representative.members.map((m: { id: number; role: string }) => [
        m.id,
        m.role,
      ]),
    ).toEqual([[second, "Müdür"]]);
  });

  it("refuses linking a candidate and keeps the existing links", async () => {
    const kept = await createMember("__test__ Kalan Üye");
    const candidate = await createMember("__test__ Aday Üye", "candidate");
    const { body } = await createRepresentative({
      name: "__test__ Aday Güncelleme",
      members: [{ memberId: kept }],
    });

    const res = await patch(body.id, { members: [{ memberId: candidate }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Aday veya reddedilmiş üyeye yetkili bağlanamaz",
    );

    const { body: representative } = await getRepresentative(body.id);
    expect(representative.members.map((m: { id: number }) => m.id)).toEqual([
      kept,
    ]);
  });

  it("switches aktif/pasif without touching links or fields", async () => {
    const memberId = await createMember("__test__ Durum Üyesi");
    const { body } = await createRepresentative({
      name: "__test__ Durum",
      phone: "0532 000 00 00",
      members: [{ memberId }],
    });

    await patch(body.id, { active: false });

    const { body: representative } = await getRepresentative(body.id);
    expect(representative.active).toBe(false);
    expect(representative.phone).toBe("0532 000 00 00");
    expect(representative.members).toHaveLength(1);
  });

  it("returns 404 for an unknown yetkili", async () => {
    const res = await patch(2147483000, { name: "__test__ Yok" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/representatives/:id", () => {
  it("deletes the yetkili and its links but not the member", async () => {
    const memberId = await createMember("__test__ Kalacak Üye");
    const { body } = await createRepresentative({
      name: "__test__ Silinecek",
      members: [{ memberId }],
    });

    const res = await representativesRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await getRepresentative(body.id)).res.status).toBe(404);

    const member = await (await membersRoute.request(`/${memberId}`)).json();
    expect(member.title).toBe("__test__ Kalacak Üye");
    expect(member.representatives).toEqual([]);
  });

  it("returns 404 for an unknown yetkili", async () => {
    const res = await representativesRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("yetkili and Organizasyon", () => {
  it("lists each group row on the yetkili", async () => {
    const { body: created } = await createRepresentative({
      name: `__test__ Kurullu ${suffix}`,
    });
    const baskan = await createRole(`__test__ Başkan ${suffix}`);
    const uye = await createRole(`__test__ Üye ${suffix}`);

    const boardName = `__test__ Denetim ${suffix}`;
    const committeeName = `__test__ Komite ${suffix}`;
    const boardId = await createGroup("supervisory-boards", boardName, [
      { representativeId: created.id, roleId: uye.id },
    ]);
    const committeeId = await createGroup("committees", committeeName, [
      { representativeId: created.id, roleId: baskan.id },
      { representativeId: created.id, roleId: uye.id },
    ]);

    const { body } = await getRepresentative(created.id);
    expect(body.organizations).toEqual([
      {
        organization: "committee",
        rowId: expect.any(Number),
        groupId: committeeId,
        groupName: committeeName,
        role: baskan.name,
      },
      {
        organization: "committee",
        rowId: expect.any(Number),
        groupId: committeeId,
        groupName: committeeName,
        role: uye.name,
      },
      {
        organization: "supervisory_board",
        rowId: expect.any(Number),
        groupId: boardId,
        groupName: boardName,
        role: uye.name,
      },
    ]);
  });

  it("removes a deleted yetkili from groups and names them", async () => {
    const { body: created } = await createRepresentative({
      name: `__test__ Silinecek ${suffix}`,
    });
    const role = await createRole(`__test__ Sekreter ${suffix}`);
    const groupName = `__test__ Silinenli ${suffix}`;
    const groupId = await createGroup("committees", groupName, [
      { representativeId: created.id, roleId: role.id },
    ]);

    const res = await representativesRoute.request(`/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(committeeMemberTable)
      .where(eq(committeeMemberTable.groupId, groupId));
    expect(rows).toEqual([]);

    const [entry] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "representative"),
          eq(auditLogTable.action, "delete"),
          eq(auditLogTable.entityId, String(created.id)),
        ),
      )
      .orderBy(desc(auditLogTable.id));
    expect(entry.details).toContainEqual({
      label: "Organizasyonlar",
      value: `Komiteler › ${groupName}: ${role.name}`,
    });
  });
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function photoFile(name = "photo.jpg") {
  return new File([PNG], name, { type: "image/jpeg" });
}

async function lastEntry(action: string, id: number) {
  const [entry] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.entityType, "representative"),
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, String(id)),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return entry;
}

/** Creates a yetkili with a photo; resolves to its id and stored filename */
async function createWithPhoto(name: string) {
  const { res, body } = await createRepresentative({
    name,
    photo: photoFile(),
  });
  expect(res.status).toBe(201);
  const { body: representative } = await getRepresentative(body.id);
  createdFiles.push(representative.photo);
  return { id: body.id as number, photo: representative.photo as string };
}

const storedPhotos = async () =>
  (await readdir(getFilePath(""))).filter((name) => name.startsWith("photo_"));

describe("yetkili photo", () => {
  it("stores a photo and records Fotoğraf: Var", async () => {
    const { id, photo } = await createWithPhoto("__test__ Fotoğraflı");
    expect(photo).toMatch(/^photo_.+\.png$/);
    expect(await readStoredFile(photo)).not.toBeNull();
    expect((await lastEntry("create", id)).details).toContainEqual({
      label: "Fotoğraf",
      value: "Var",
    });
  });

  it("rejects a photo that isn't an image", async () => {
    const name = `__test__ Sahte Fotoğraf ${suffix}`;
    const fake = new File(["<html></html>"], "photo.jpg", {
      type: "image/jpeg",
    });
    const { res, body } = await createRepresentative({ name, photo: fake });
    expect(res.status).toBe(415);
    expect(body).toEqual({
      error: "Sadece JPG veya PNG fotoğraflar kabul edilir",
    });
    const rows = await db
      .select()
      .from(authorizedRepresentativeTable)
      .where(eq(authorizedRepresentativeTable.name, name));
    expect(rows).toEqual([]);
  });

  it("replaces the photo and deletes the old file", async () => {
    const { id, photo: old } = await createWithPhoto("__test__ Değişen");
    expect((await patch(id, { photo: photoFile() })).status).toBe(200);

    const { body } = await getRepresentative(id);
    createdFiles.push(body.photo);
    expect(body.photo).toMatch(/^photo_/);
    expect(body.photo).not.toBe(old);
    expect(await readStoredFile(old)).toBeNull();
    expect((await lastEntry("update", id)).changes).toContainEqual({
      label: "Fotoğraf",
      from: "Eski fotoğraf",
      to: "Yeni fotoğraf",
    });
  });

  it("removes the photo", async () => {
    const { id, photo } = await createWithPhoto("__test__ Silinen Fotoğraf");
    expect((await patch(id, { removePhoto: "true" })).status).toBe(200);

    const { body } = await getRepresentative(id);
    expect(body.photo).toBeNull();
    expect(await readStoredFile(photo)).toBeNull();
    expect((await lastEntry("update", id)).changes).toContainEqual({
      label: "Fotoğraf",
      from: "Eski fotoğraf",
      to: "—",
    });
  });

  it("keeps the photo when the form is saved without one", async () => {
    const { id, photo } = await createWithPhoto("__test__ Kalan Fotoğraf");
    await patch(id, { name: "__test__ Kalan Fotoğraf 2" });
    await patch(id, { active: false });

    const { body } = await getRepresentative(id);
    expect(body.photo).toBe(photo);
    expect(await readStoredFile(photo)).not.toBeNull();
    const update = await lastEntry("update", id);
    expect(update.changes).not.toContainEqual(
      expect.objectContaining({ label: "Fotoğraf" }),
    );
  });

  it("stores no photo when the save fails", async () => {
    const memberId = await createMember("__test__ Aday Fotoğraf", "candidate");
    const before = await storedPhotos();
    const { res } = await createRepresentative({
      name: "__test__ Başarısız Fotoğraf",
      photo: photoFile(),
      members: [{ memberId, role: null }],
    });
    expect(res.status).toBe(400);
    const added = (await storedPhotos()).filter((f) => !before.includes(f));
    // another test in this file may store one meanwhile; none may be orphaned
    for (const file of added) {
      const owners = await db
        .select({ id: authorizedRepresentativeTable.id })
        .from(authorizedRepresentativeTable)
        .where(eq(authorizedRepresentativeTable.photo, file));
      expect(owners).not.toEqual([]);
    }
  });

  it("deletes the photo file with the yetkili", async () => {
    const { id, photo } = await createWithPhoto("__test__ Silinen Yetkili");
    const res = await representativesRoute.request(`/${id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await readStoredFile(photo)).toBeNull();
    expect((await lastEntry("delete", id)).details).toContainEqual({
      label: "Fotoğraf",
      value: "Var",
    });
  });

  it("includes the photo where the yetkili is listed", async () => {
    const memberId = await createMember("__test__ Fotoğraflı Üye");
    const { id, photo } = await createWithPhoto("__test__ Görünen Fotoğraf");
    await patch(id, { members: [{ memberId, role: null }] });
    const role = await createRole(`__test__ Fotoğraf Görevi ${suffix}`);
    const groupId = await createGroup(
      "committees",
      `__test__ Fotoğraf Komitesi ${suffix}`,
      [{ representativeId: id, roleId: role.id }],
    );

    const all = await (await representativesRoute.request("/")).json();
    expect(all.find((r: { id: number }) => r.id === id).photo).toBe(photo);

    const member = await (await membersRoute.request(`/${memberId}`)).json();
    expect(member.representatives[0].photo).toBe(photo);

    const group = await (
      await organizationsRoute.request(`/committees/${groupId}`)
    ).json();
    expect(group.people[0].representativePhoto).toBe(photo);
  });
});
