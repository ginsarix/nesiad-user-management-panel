import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogTable, memberTable, sectorTable } from "@/db/schema";
import { deleteFile, readStoredFile } from "@/lib/file-storage";
import { filesRoute } from "./files";
import { membersRoute } from "./members";

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const createdIds: number[] = [];
const createdSectorIds: number[] = [];
const createdFiles: string[] = [];

afterAll(async () => {
  if (createdIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, createdIds));
  }
  if (createdSectorIds.length) {
    await db
      .delete(sectorTable)
      .where(inArray(sectorTable.id, createdSectorIds));
  }
  await Promise.all(createdFiles.map(deleteFile));
});

function form(fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return body;
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

function pdfFile(name = "belge.pdf") {
  return new File([PDF], name, { type: "application/pdf" });
}

function pngFile(name = "logo.png") {
  return new File([PNG], name, { type: "image/png" });
}

async function createMember(fields: Record<string, string | File>) {
  const res = await membersRoute.request("/", {
    method: "POST",
    body: form(fields),
  });
  const body = await res.json();
  if (res.status === 201) createdIds.push(body.id);
  return { res, body };
}

async function getMember(id: number) {
  const res = await membersRoute.request(`/${id}`);
  return { res, body: await res.json() };
}

describe("POST /api/members", () => {
  it("creates a member with blank fields stored as null", async () => {
    const { res, body } = await createMember({
      title: "  __test__ Boş Alanlar  ",
      sectorId: "",
      phone: "0384 000 00 00",
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.title).toBe("__test__ Boş Alanlar");
    expect(member.sectorId).toBeNull();
    expect(member.sector).toBeNull();
    expect(member.phone).toBe("0384 000 00 00");
    expect(member.logo).toBeNull();
  });

  it("requires a title", async () => {
    const { res, body } = await createMember({ title: "   " });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Ünvan boş olamaz");
  });

  it("stores real dates and defaults to aktif", async () => {
    const { res, body } = await createMember({
      title: "__test__ Tarihli",
      memberLoginDate: "2014-03-05",
      foundingDate: "1998-01-01",
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.memberLoginDate).toBe("2014-03-05");
    expect(member.foundingDate).toBe("1998-01-01");
    expect(member.status).toBe("active");
  });

  it("defaults to active and accepts passive", async () => {
    const { body: defaulted } = await createMember({
      title: "__test__ Varsayılan Durum",
    });
    expect((await getMember(defaulted.id)).body.status).toBe("active");

    const { body } = await createMember({
      title: "__test__ Pasif",
      status: "passive",
    });
    expect((await getMember(body.id)).body.status).toBe("passive");
  });

  it("refuses creating a candidate", async () => {
    const { res } = await createMember({
      title: "__test__ Aday Oluşturma",
      status: "candidate",
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ["05.03.2014", "Geçerli bir tarih girin (gg.aa.yyyy)"],
    ["2024-02-31", "Geçerli bir tarih girin (gg.aa.yyyy)"],
    ["Mart 2014", "Geçerli bir tarih girin (gg.aa.yyyy)"],
    ["2999-01-01", "Tarih gelecekte olamaz"],
  ])("rejects %j as a date", async (memberLoginDate, error) => {
    const { res, body } = await createMember({
      title: "__test__ Hatalı Tarih",
      memberLoginDate,
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe(error);
  });

  it("saves the logo and stores its filename", async () => {
    const { res, body } = await createMember({
      title: "__test__ Logolu",
      logo: pngFile(),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.logo).toMatch(/^logo_.+\.png$/);
    createdFiles.push(member.logo);
    expect(await readStoredFile(member.logo)).not.toBeNull();
  });

  it("rejects a non-image disguised as an image", async () => {
    const fake = new File(["not an image"], "fake.png", { type: "image/png" });
    const { res, body } = await createMember({
      title: "__test__ Sahte Logo",
      logo: fake,
    });
    expect(res.status).toBe(415);
    expect(body.error).toBe("Sadece resim dosyaları kabul edilir");
  });
});

async function createSector(name: string) {
  const [sector] = await db
    .insert(sectorTable)
    .values({ name, nameKey: name.toLocaleLowerCase("tr") })
    .returning({ id: sectorTable.id });
  createdSectorIds.push(sector.id);
  return sector.id;
}

describe("member sector", () => {
  it("links a sector by id and returns its name", async () => {
    const sectorId = await createSector("__test__ Üye Sektörü");
    const { res, body } = await createMember({
      title: "__test__ Sektörlü",
      sectorId: String(sectorId),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.sectorId).toBe(sectorId);
    expect(member.sector).toBe("__test__ Üye Sektörü");

    const list = await (await membersRoute.request("/")).json();
    const listed = list.find((m: { id: number }) => m.id === body.id);
    expect(listed.sector).toBe("__test__ Üye Sektörü");
  });

  it("clears the sector when sent blank", async () => {
    const sectorId = await createSector("__test__ Temizlenecek Sektör");
    const { body } = await createMember({
      title: "__test__ Sektörü Temizlenecek",
      sectorId: String(sectorId),
    });

    await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ sectorId: "" }),
    });

    const { body: member } = await getMember(body.id);
    expect(member.sectorId).toBeNull();
  });

  it("rejects a sector that doesn't exist", async () => {
    const { res, body } = await createMember({
      title: "__test__ Olmayan Sektör",
      sectorId: "2147483000",
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Seçilen sektör bulunamadı");
  });

  it("rejects a sector id that isn't a number", async () => {
    const { res, body } = await createMember({
      title: "__test__ Geçersiz Sektör",
      sectorId: "inşaat",
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Geçersiz sektör");
  });
});

describe("PATCH /api/members/:id", () => {
  it("updates fields and clears blank ones", async () => {
    const { body } = await createMember({
      title: "__test__ Güncellenecek",
      phone: "0384 000 00 00",
    });

    const res = await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ title: "__test__ Güncellendi", phone: "" }),
    });
    expect(res.status).toBe(200);

    const { body: member } = await getMember(body.id);
    expect(member.title).toBe("__test__ Güncellendi");
    expect(member.phone).toBeNull();
  });

  it("switches aktif/pasif without touching other fields", async () => {
    const { body } = await createMember({
      title: "__test__ Durum",
      memberLoginDate: "2014-03-05",
    });

    await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ status: "passive" }),
    });

    const { body: member } = await getMember(body.id);
    expect(member.status).toBe("passive");
    expect(member.title).toBe("__test__ Durum");
    expect(member.memberLoginDate).toBe("2014-03-05");
  });

  it("refuses changing a candidate through PATCH", async () => {
    const [candidate] = await db
      .insert(memberTable)
      .values({ title: "__test__ Aday Durum", status: "candidate" })
      .returning();
    createdIds.push(candidate.id);

    const res = await membersRoute.request(`/${candidate.id}`, {
      method: "PATCH",
      body: form({ status: "active" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu üyenin durumu buradan değiştirilemez",
    );
    expect((await getMember(candidate.id)).body.status).toBe("candidate");
  });

  it("still edits other fields of a candidate", async () => {
    const [candidate] = await db
      .insert(memberTable)
      .values({ title: "__test__ Aday Düzenleme", status: "candidate" })
      .returning();
    createdIds.push(candidate.id);

    const res = await membersRoute.request(`/${candidate.id}`, {
      method: "PATCH",
      body: form({ title: "__test__ Aday Düzenlendi" }),
    });
    expect(res.status).toBe(200);

    const { body: member } = await getMember(candidate.id);
    expect(member.title).toBe("__test__ Aday Düzenlendi");
    expect(member.status).toBe("candidate");
  });

  it("clears a date sent blank", async () => {
    const { body } = await createMember({
      title: "__test__ Tarih Silme",
      foundingDate: "1998-01-01",
    });

    await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ foundingDate: "" }),
    });

    const { body: member } = await getMember(body.id);
    expect(member.foundingDate).toBeNull();
  });

  it("replaces the logo and deletes the old file", async () => {
    const { body } = await createMember({
      title: "__test__ Logo Değişimi",
      logo: pngFile("eski.png"),
    });
    const { body: before } = await getMember(body.id);
    createdFiles.push(before.logo);

    await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ logo: pngFile("yeni.png") }),
    });

    const { body: after } = await getMember(body.id);
    createdFiles.push(after.logo);
    expect(after.logo).toMatch(/^yeni_.+\.png$/);
    expect(await readStoredFile(before.logo)).toBeNull();
    expect(await readStoredFile(after.logo)).not.toBeNull();
  });

  it("removes the logo", async () => {
    const { body } = await createMember({
      title: "__test__ Logo Silme",
      logo: pngFile(),
    });
    const { body: before } = await getMember(body.id);
    createdFiles.push(before.logo);

    await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ removeLogo: "true" }),
    });

    const { body: after } = await getMember(body.id);
    expect(after.logo).toBeNull();
    expect(await readStoredFile(before.logo)).toBeNull();
  });

  it("returns 404 for an unknown member", async () => {
    const res = await membersRoute.request("/999999999", {
      method: "PATCH",
      body: form({ title: "__test__ Yok" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/members/:id", () => {
  it("deletes the member and its logo", async () => {
    const { body } = await createMember({
      title: "__test__ Silinecek",
      logo: pngFile(),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.logo);

    const res = await membersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    expect((await getMember(body.id)).res.status).toBe(404);
    expect(await readStoredFile(member.logo)).toBeNull();
  });

  it("returns 404 for an unknown member", async () => {
    const res = await membersRoute.request("/999999999", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

const TC = "10000000146";
const TC_2 = "10000000220"; // not necessarily valid; only used where unchecked

async function patchMember(id: number, fields: Record<string, string | File>) {
  const res = await membersRoute.request(`/${id}`, {
    method: "PATCH",
    body: form(fields),
  });
  return { res, body: await res.json() };
}

describe("applicant fields", () => {
  it("never returns the TC number in list or detail", async () => {
    const { body } = await createMember({
      title: "__test__ TC Gizli",
      nationalId: TC,
    });

    const { body: member } = await getMember(body.id);
    expect(member.nationalIdMasked).toBe("100••••••••");
    expect(member).not.toHaveProperty("nationalId");

    const list = await (await membersRoute.request("/")).json();
    const item = list.find((m: { id: number }) => m.id === body.id);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("nationalId");
    expect(item).not.toHaveProperty("nationalIdMasked");
    expect(item).not.toHaveProperty("identityDocument");
    expect(item).not.toHaveProperty("activityDocument");
    expect(JSON.stringify(item)).not.toContain(TC);
    expect(JSON.stringify(member)).not.toContain(TC);
  });

  it("returns null masked when there is no TC number", async () => {
    const { body } = await createMember({ title: "__test__ TC Yok" });
    const { body: member } = await getMember(body.id);
    expect(member.nationalIdMasked).toBeNull();
  });

  it("reveals the TC number on its own endpoint", async () => {
    const { body } = await createMember({
      title: "__test__ TC Göster",
      nationalId: TC,
    });
    const res = await membersRoute.request(`/${body.id}/national-id`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nationalId: TC });

    const missing = await membersRoute.request("/999999999/national-id");
    expect(missing.status).toBe(404);
  });

  it("keeps the TC number when PATCH sends it blank", async () => {
    const { body } = await createMember({
      title: "__test__ TC Korunur",
      nationalId: TC,
    });
    const { res } = await patchMember(body.id, { nationalId: "" });
    expect(res.status).toBe(200);

    const reveal = await membersRoute.request(`/${body.id}/national-id`);
    expect(await reveal.json()).toEqual({ nationalId: TC });
  });

  it("refuses an invalid TC number", async () => {
    const { res } = await createMember({
      title: "__test__ TC Hatalı",
      nationalId: "10000000147",
    });
    expect(res.status).toBe(400);

    const { body } = await createMember({ title: "__test__ TC Hatalı 2" });
    const patched = await patchMember(body.id, { nationalId: `${TC_2}9` });
    expect(patched.res.status).toBe(400);
  });

  it("stores the applicant's text fields and a normalized website", async () => {
    const { res, body } = await createMember({
      title: "__test__ Başvuran",
      applicantFirstName: " Ayşe ",
      applicantLastName: "Yılmaz",
      email: "ayse@ornek.com",
      mobilePhone: "0532 111 22 33",
      employeeCount: "12",
      gender: "female",
      birthDate: "1990-02-03",
      website: "ornek.com",
      education: "",
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.applicantFirstName).toBe("Ayşe");
    expect(member.employeeCount).toBe(12);
    expect(member.gender).toBe("female");
    expect(member.birthDate).toBe("1990-02-03");
    expect(member.website).toBe("https://ornek.com");
    expect(member.education).toBeNull();
    expect(member.consentedAt).toBeNull();
  });

  it("refuses a javascript: website", async () => {
    const { res } = await createMember({
      title: "__test__ Kötü Site",
      website: "javascript:alert(1)",
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ["email", "değil"],
    ["mobilePhone", "0212 111 22 33"],
    ["employeeCount", "-1"],
    ["employeeCount", "1.5"],
    ["gender", "x"],
  ])("refuses an invalid %s", async (field, value) => {
    const { res } = await createMember({
      title: "__test__ Geçersiz Alan",
      [field]: value,
    });
    expect(res.status).toBe(400);
  });

  it("ignores consentedAt from staff", async () => {
    const { body } = await createMember({
      title: "__test__ Onay",
      consentedAt: "2020-01-01T00:00:00Z",
    });
    const { body: member } = await getMember(body.id);
    expect(member.consentedAt).toBeNull();
  });

  it("stores documents and replaces them, removing the old file", async () => {
    const { body } = await createMember({
      title: "__test__ Belge",
      identityDocument: pdfFile(),
    });
    const { body: before } = await getMember(body.id);
    expect(before.identityDocument).toMatch(/^document_.+\.pdf$/);
    createdFiles.push(before.identityDocument);

    await patchMember(body.id, { identityDocument: pngFile("kimlik.png") });
    const { body: after } = await getMember(body.id);
    createdFiles.push(after.identityDocument);
    expect(after.identityDocument).toMatch(/^document_.+\.png$/);
    expect(await readStoredFile(before.identityDocument)).toBeNull();
    expect(await readStoredFile(after.identityDocument)).not.toBeNull();
  });

  it("rejects a non-document upload and changes nothing", async () => {
    const { body } = await createMember({ title: "__test__ Sahte Belge" });
    const { res } = await patchMember(body.id, {
      title: "__test__ Sahte Belge Yeni",
      identityDocument: new File(["düz metin"], "a.pdf", {
        type: "application/pdf",
      }),
    });
    expect(res.status).toBe(415);

    const { body: member } = await getMember(body.id);
    expect(member.title).toBe("__test__ Sahte Belge");
    expect(member.identityDocument).toBeNull();
  });

  it("logs applicant field changes without values", async () => {
    const { body } = await createMember({ title: "__test__ Denetim" });
    await patchMember(body.id, {
      birthPlace: "Nevşehir-Gizli",
      email: "gizli@ornek.com",
      nationalId: TC,
    });

    const [entry] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "member"),
          eq(auditLogTable.action, "update"),
          eq(auditLogTable.entityId, String(body.id)),
        ),
      )
      .orderBy(desc(auditLogTable.id))
      .limit(1);

    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { label: "Doğum Yeri", from: "—", to: "•••" },
        { label: "E-posta", from: "—", to: "•••" },
        { label: "TC Kimlik No", from: "—", to: "•••" },
      ]),
    );
    expect(entry.changes).toHaveLength(3);
    const json = JSON.stringify(entry);
    expect(json).not.toContain("Nevşehir-Gizli");
    expect(json).not.toContain("gizli@ornek.com");
    expect(json).not.toContain(TC);
  });

  it("leaves applicant data out of the delete entry", async () => {
    const { body } = await createMember({
      title: "__test__ Silinen Başvuran",
      birthPlace: "Nevşehir-Gizli",
      nationalId: TC,
      identityDocument: pdfFile(),
      activityDocument: pdfFile("faaliyet.pdf"),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.identityDocument, member.activityDocument);

    const res = await membersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const [entry] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "member"),
          eq(auditLogTable.action, "delete"),
          eq(auditLogTable.entityId, String(body.id)),
        ),
      );
    expect(entry.details?.map((d) => d.label)).toEqual([
      "Ünvan",
      "Durum",
      "Telefon",
      "Adres",
      "Üye Giriş Tarihi",
      "Kuruluş Tarihi",
      "Sektör",
      "Logo",
      "Yetkililer",
    ]);
    expect(JSON.stringify(entry)).not.toContain(TC);
    expect(await readStoredFile(member.identityDocument)).toBeNull();
    expect(await readStoredFile(member.activityDocument)).toBeNull();
  });
});

describe("GET /api/files/:filename", () => {
  it("serves a PDF as application/pdf, uncached for documents", async () => {
    const { body } = await createMember({
      title: "__test__ PDF Servis",
      identityDocument: pdfFile(),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.identityDocument);

    const res = await filesRoute.request(`/${member.identityDocument}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps the immutable cache header on logos", async () => {
    const { body } = await createMember({
      title: "__test__ Logo Önbellek",
      logo: pngFile(),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.logo);

    const res = await filesRoute.request(`/${member.logo}`);
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
  });

  it("serves a stored logo with an image content type", async () => {
    const { body } = await createMember({
      title: "__test__ Dosya",
      logo: pngFile(),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.logo);

    const res = await filesRoute.request(`/${member.logo}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
  });

  it.each([
    "..%2Fpackage.json",
    "..%2F..%2Fetc%2Fpasswd",
    ".env",
    "does-not-exist.png",
  ])("refuses %s", async (name) => {
    const res = await filesRoute.request(`/${name}`);
    expect(res.status).toBe(404);
  });
});
