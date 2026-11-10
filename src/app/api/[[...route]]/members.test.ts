import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  collectionTable,
  memberTable,
  parameterTable,
  sectorTable,
} from "@/db/schema";
import { getApplicationNoticeSettings } from "@/lib/application-notice-settings";
import { deleteFile, readStoredFile } from "@/lib/file-storage";
import type { NetgsmClient } from "@/lib/sms/netgsm";
import { fillTemplate } from "@/lib/sms/templates";
import { filesRoute } from "./files";
import { membersRoute } from "./members";

const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/mail", () => mail);

// Tests never reach NetGSM; a test may swap in another fake
const netgsm = vi.hoisted(() => ({ client: null as NetgsmClient | null }));
vi.mock("@/lib/sms/netgsm", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/sms/netgsm")>();
  return { ...mod, netgsmClient: () => netgsm.client ?? mod.fakeNetgsmClient };
});

const sentSms: { no: string; msg: string }[] = [];

afterEach(() => {
  netgsm.client = null;
  sentSms.length = 0;
  mail.sendEmail.mockReset();
  mail.sendEmail.mockResolvedValue(undefined);
});

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const createdIds: number[] = [];
const createdSectorIds: number[] = [];
const createdFiles: string[] = [];

const createdParameterIds: number[] = [];

afterAll(async () => {
  if (createdIds.length) {
    await db
      .delete(collectionTable)
      .where(inArray(collectionTable.memberId, createdIds));
    await db.delete(memberTable).where(inArray(memberTable.id, createdIds));
  }
  if (createdSectorIds.length) {
    await db
      .delete(sectorTable)
      .where(inArray(sectorTable.id, createdSectorIds));
  }
  if (createdParameterIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, createdParameterIds));
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

const SVG = Buffer.from(
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>',
);

function svgFile(name = "logo.svg") {
  return new File([SVG], name, { type: "image/svg+xml" });
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
    expect(body.error).toBe(
      "Sadece resim, PDF veya SVG dosyaları kabul edilir",
    );
  });

  it("stores a PDF logo's original next to its image", async () => {
    const { res, body } = await createMember({
      title: "__test__ PDF Logolu",
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    createdFiles.push(member.logo, member.logoOriginal);
    expect(member.logo).toMatch(/^logo_.+\.png$/);
    expect(member.logoOriginal).toMatch(/^logo_.+\.pdf$/);
    expect(await readStoredFile(member.logoOriginal)).not.toBeNull();

    const [entry] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "member"),
          eq(auditLogTable.entityId, String(body.id)),
        ),
      );
    expect(entry.details).toContainEqual({ label: "Logo", value: "Var (PDF)" });
  });

  it("stores an SVG logo's original next to its image", async () => {
    const { res, body } = await createMember({
      title: "__test__ SVG Logolu",
      logo: pngFile(),
      logoOriginal: svgFile(),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    createdFiles.push(member.logo, member.logoOriginal);
    expect(member.logoOriginal).toMatch(/^logo_.+\.svg$/);

    const [entry] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "member"),
          eq(auditLogTable.entityId, String(body.id)),
        ),
      );
    expect(entry.details).toContainEqual({ label: "Logo", value: "Var (SVG)" });
  });

  it("refuses HTML sent as an SVG original", async () => {
    const html = new File(["<html><script>alert(1)</script></html>"], "x.svg", {
      type: "image/svg+xml",
    });
    const { res } = await createMember({
      title: "__test__ Sahte SVG Logo",
      logo: pngFile(),
      logoOriginal: html,
    });
    expect(res.status).toBe(415);
  });

  it("refuses an SVG as the logo image itself", async () => {
    const { res } = await createMember({
      title: "__test__ SVG Resim",
      logo: svgFile(),
    });
    expect(res.status).toBe(415);
  });

  it("refuses a logo PDF without the image drawn from it", async () => {
    const { res } = await createMember({
      title: "__test__ Yalnız PDF",
      logoOriginal: pdfFile("logo.pdf"),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a logo PDF that isn't a PDF", async () => {
    const { res, body } = await createMember({
      title: "__test__ Sahte PDF Logo",
      logo: pngFile(),
      logoOriginal: pngFile("logo.pdf"),
    });
    expect(res.status).toBe(415);
    expect(body.error).toBe(
      "Sadece resim, PDF veya SVG dosyaları kabul edilir",
    );
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

  it("replaces a PDF logo, deleting its image and its PDF", async () => {
    const { body } = await createMember({
      title: "__test__ PDF Logo Değişimi",
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
    });
    const { body: before } = await getMember(body.id);
    createdFiles.push(before.logo, before.logoOriginal);

    const { res } = await patchMember(body.id, { logo: pngFile("yeni.png") });
    expect(res.status).toBe(200);

    const { body: after } = await getMember(body.id);
    createdFiles.push(after.logo);
    expect(after.logoOriginal).toBeNull();
    expect(await readStoredFile(before.logo)).toBeNull();
    expect(await readStoredFile(before.logoOriginal)).toBeNull();
  });

  it("removes a PDF logo with its PDF", async () => {
    const { body } = await createMember({
      title: "__test__ PDF Logo Silme",
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
    });
    const { body: before } = await getMember(body.id);
    createdFiles.push(before.logo, before.logoOriginal);

    await patchMember(body.id, { removeLogo: "true" });

    const { body: after } = await getMember(body.id);
    expect(after.logo).toBeNull();
    expect(after.logoOriginal).toBeNull();
    expect(await readStoredFile(before.logoOriginal)).toBeNull();
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

/** One tahsilat for the member, inserted directly */
async function addCollection(memberId: number) {
  const key = crypto.randomUUID().slice(0, 8);
  const parameters = await db
    .insert(parameterTable)
    .values([
      {
        kind: "collection_category" as const,
        name: `__test__ Tür ${key}`,
        nameKey: `__test__ tür ${key}`,
      },
      {
        kind: "collection_method" as const,
        name: `__test__ Tip ${key}`,
        nameKey: `__test__ tip ${key}`,
      },
    ])
    .returning({ id: parameterTable.id });
  createdParameterIds.push(...parameters.map((p) => p.id));
  await db.insert(collectionTable).values({
    memberId,
    categoryId: parameters[0].id,
    methodId: parameters[1].id,
    amount: "10.00",
    date: "2026-11-01",
  });
}

describe("members with tahsilatlar", () => {
  it("includes collectionCount in the member detail", async () => {
    const { body } = await createMember({ title: "__test__ Tahsilatlı" });
    expect((await getMember(body.id)).body.collectionCount).toBe(0);
    await addCollection(body.id);
    expect((await getMember(body.id)).body.collectionCount).toBe(1);
  });

  it("refuses to delete a member with tahsilatlar", async () => {
    const { body } = await createMember({
      title: "__test__ Silinemez",
      logo: pngFile(),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.logo);
    await addCollection(body.id);

    const res = await membersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu üyeye ait 1 tahsilat var. Silmek yerine pasif yapabilirsiniz.",
    );
    expect((await getMember(body.id)).res.status).toBe(200);
    expect(await readStoredFile(member.logo)).not.toBeNull();
  });
});

describe("DELETE /api/members/:id", () => {
  it("deletes the member, its logo and its documents", async () => {
    const { body } = await createMember({
      title: "__test__ Silinecek",
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
      identityDocument: pdfFile("kimlik.pdf"),
      activityDocument: pdfFile("faaliyet.pdf"),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(
      member.logo,
      member.logoOriginal,
      member.identityDocument,
      member.activityDocument,
    );
    expect(await readStoredFile(member.identityDocument)).not.toBeNull();
    expect(await readStoredFile(member.activityDocument)).not.toBeNull();

    const res = await membersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    expect((await getMember(body.id)).res.status).toBe(404);
    expect(await readStoredFile(member.logo)).toBeNull();
    expect(await readStoredFile(member.logoOriginal)).toBeNull();
    expect(await readStoredFile(member.identityDocument)).toBeNull();
    expect(await readStoredFile(member.activityDocument)).toBeNull();
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
    ["employeeCount", "5321112233"],
    ["employeeCount", "1e3"],
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

  it("serves an SVG original sandboxed, so it can't run scripts", async () => {
    const { body } = await createMember({
      title: "__test__ SVG Servis",
      logo: pngFile(),
      logoOriginal: svgFile(),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.logo, member.logoOriginal);

    const res = await filesRoute.request(`/${member.logoOriginal}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toMatch(
      /^sandbox; default-src 'none'/,
    );

    const png = await filesRoute.request(`/${member.logo}`);
    expect(png.headers.get("Content-Security-Policy")).toBeNull();
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

describe("POST /api/members/:id/decision", () => {
  const MAIL = "basvuran@example.com";

  /** A recording NetGSM fake that answers like a success unless told otherwise */
  function fakeNetgsm(
    answer: () => Promise<{ status: number; body: unknown }> = async () => ({
      status: 200,
      body: { code: "00", jobid: "J-1" },
    }),
  ) {
    netgsm.client = {
      dryRun: false,
      send: async (messages) => {
        sentSms.push(...messages);
        return answer();
      },
    };
  }

  async function createApplicant(
    status: "candidate" | "rejected" | "active" | "passive",
    extra: Partial<typeof memberTable.$inferInsert> = {},
  ) {
    const [member] = await db
      .insert(memberTable)
      .values({
        title: "__test__ Karar Firması",
        status,
        applicantFirstName: "Ayşe",
        applicantLastName: "Yılmaz",
        email: MAIL,
        mobilePhone: "0532 111 22 33",
        ...extra,
      })
      .returning({ id: memberTable.id });
    createdIds.push(member.id);
    return member.id;
  }

  function decide(id: number, body: unknown) {
    return membersRoute.request(`/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const ACCEPT = {
    decision: "accept",
    memberLoginDate: "2026-01-15",
    sectorId: null,
  };

  async function statusOf(id: number) {
    const [row] = await db
      .select({ status: memberTable.status })
      .from(memberTable)
      .where(eq(memberTable.id, id));
    return row.status;
  }

  async function auditRows(id: number, action: string) {
    return db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "member"),
          eq(auditLogTable.entityId, String(id)),
          eq(auditLogTable.action, action),
        ),
      );
  }

  async function createSector() {
    const [sector] = await db
      .insert(sectorTable)
      .values({
        name: `__test__ Karar Sektörü ${Date.now()}${Math.random()}`,
        nameKey: `__test__ karar ${Date.now()}${Math.random()}`,
      })
      .returning();
    createdSectorIds.push(sector.id);
    return sector;
  }

  it("accepts a candidate", async () => {
    fakeNetgsm();
    const sector = await createSector();
    const id = await createApplicant("candidate");

    const res = await decide(id, {
      decision: "accept",
      memberLoginDate: "2026-01-15",
      sectorId: sector.id,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "active",
      notices: { email: "sent", sms: "sent" },
    });
    const [row] = await db
      .select()
      .from(memberTable)
      .where(eq(memberTable.id, id));
    expect(row.status).toBe("active");
    expect(row.memberLoginDate).toBe("2026-01-15");
    expect(row.sectorId).toBe(sector.id);

    const settings = await getApplicationNoticeSettings();
    const values = { ad: "Ayşe Yılmaz", firma: "__test__ Karar Firması" };
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendEmail).toHaveBeenCalledWith({
      to: MAIL,
      subject: fillTemplate(settings.acceptedEmailSubject, values),
      text: fillTemplate(settings.acceptedEmailBody, values),
    });
    expect(sentSms).toEqual([
      { no: "5321112233", msg: fillTemplate(settings.acceptedSms, values) },
    ]);

    const [audit] = await auditRows(id, "application_accept");
    expect(audit.changes).toEqual([
      { label: "Durum", from: "Aday", to: "Aktif" },
      { label: "Üye Giriş Tarihi", from: "—", to: "15.01.2026" },
      { label: "Sektör", from: "—", to: sector.name },
    ]);
    expect(JSON.stringify(audit)).not.toContain(MAIL);
    expect(JSON.stringify(audit)).not.toContain("Ayşe");
  });

  it("rejects a candidate", async () => {
    fakeNetgsm();
    const id = await createApplicant("candidate");

    const res = await decide(id, { decision: "reject" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "rejected",
      notices: { email: "sent", sms: "sent" },
    });
    expect(await statusOf(id)).toBe("rejected");
    const settings = await getApplicationNoticeSettings();
    const values = { ad: "Ayşe Yılmaz", firma: "__test__ Karar Firması" };
    expect(mail.sendEmail).toHaveBeenCalledWith({
      to: MAIL,
      subject: fillTemplate(settings.rejectedEmailSubject, values),
      text: fillTemplate(settings.rejectedEmailBody, values),
    });
    expect(sentSms[0].msg).toBe(fillTemplate(settings.rejectedSms, values));
    const [audit] = await auditRows(id, "application_reject");
    expect(audit.changes).toEqual([
      { label: "Durum", from: "Aday", to: "Reddedildi" },
    ]);
  });

  it("stores a rejection note and logs it without its text", async () => {
    fakeNetgsm();
    const id = await createApplicant("candidate");

    const res = await decide(id, {
      decision: "reject",
      note: "  Referans doğrulanamadı  ",
    });

    expect(res.status).toBe(200);
    const [row] = await db
      .select({ rejectionNote: memberTable.rejectionNote })
      .from(memberTable)
      .where(eq(memberTable.id, id));
    expect(row.rejectionNote).toBe("Referans doğrulanamadı");

    const [audit] = await auditRows(id, "application_reject");
    expect(audit.changes).toEqual([
      { label: "Durum", from: "Aday", to: "Reddedildi" },
      { label: "Ret Notu", from: "—", to: "•••" },
    ]);
    expect(JSON.stringify(audit)).not.toContain("Referans doğrulanamadı");

    // the note never reaches the applicant
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mail.sendEmail.mock.calls)).not.toContain("Referans");
    expect(JSON.stringify(sentSms)).not.toContain("Referans");
  });

  it("stores a blank rejection note as null", async () => {
    fakeNetgsm();
    const id = await createApplicant("candidate");

    expect((await decide(id, { decision: "reject", note: "   " })).status).toBe(
      200,
    );

    const [row] = await db
      .select({ rejectionNote: memberTable.rejectionNote })
      .from(memberTable)
      .where(eq(memberTable.id, id));
    expect(row.rejectionNote).toBeNull();
  });

  it("refuses a rejection note over 1000 characters", async () => {
    fakeNetgsm();
    const id = await createApplicant("candidate");

    const res = await decide(id, {
      decision: "reject",
      note: "a".repeat(1001),
    });

    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("candidate");
  });

  it("clears the rejection note when reopened", async () => {
    fakeNetgsm();
    const id = await createApplicant("rejected", {
      rejectionNote: "Eksik belge",
    });

    expect((await decide(id, { decision: "reopen" })).status).toBe(200);

    const [row] = await db
      .select({ rejectionNote: memberTable.rejectionNote })
      .from(memberTable)
      .where(eq(memberTable.id, id));
    expect(row.rejectionNote).toBeNull();
    const [audit] = await auditRows(id, "application_reopen");
    expect(audit.changes).toEqual([
      { label: "Durum", from: "Reddedildi", to: "Aday" },
      { label: "Ret Notu", from: "•••", to: "—" },
    ]);
  });

  it("adds a candidate as passive with no notice", async () => {
    fakeNetgsm();
    const id = await createApplicant("candidate");

    const res = await decide(id, { ...ACCEPT, decision: "add_passive" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "passive", notices: null });
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(sentSms).toHaveLength(0);
    expect(await auditRows(id, "application_add_passive")).toHaveLength(1);
    expect(await auditRows(id, "application_notice")).toHaveLength(0);
  });

  it("reopens a rejected member with no notice", async () => {
    fakeNetgsm();
    const id = await createApplicant("rejected");

    const res = await decide(id, { decision: "reopen" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "candidate", notices: null });
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(sentSms).toHaveLength(0);
    const [audit] = await auditRows(id, "application_reopen");
    expect(audit.changes).toEqual([
      { label: "Durum", from: "Reddedildi", to: "Aday" },
    ]);
  });

  it("then accepts it normally", async () => {
    fakeNetgsm();
    const id = await createApplicant("candidate");

    expect((await decide(id, { decision: "reject" })).status).toBe(200);
    expect((await decide(id, { decision: "reopen" })).status).toBe(200);
    mail.sendEmail.mockClear();
    sentSms.length = 0;

    const res = await decide(id, ACCEPT);

    expect(res.status).toBe(200);
    expect((await res.json()).notices).toEqual({ email: "sent", sms: "sent" });
    const settings = await getApplicationNoticeSettings();
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendEmail.mock.calls[0][0].subject).toBe(
      fillTemplate(settings.acceptedEmailSubject, {
        ad: "Ayşe Yılmaz",
        firma: "__test__ Karar Firması",
      }),
    );
    expect(sentSms).toHaveLength(1);
    expect(await statusOf(id)).toBe("active");
  });

  it.each([
    ["accept", "rejected", ACCEPT],
    ["accept", "active", ACCEPT],
    ["reject", "passive", { decision: "reject" }],
    ["reopen", "candidate", { decision: "reopen" }],
  ] as const)("refuses %s on a %s member", async (_decision, status, body) => {
    fakeNetgsm();
    const id = await createApplicant(status);

    const res = await decide(id, body);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu başvurunun durumu değişmiş. Sayfayı yenileyin.",
    );
    expect(await statusOf(id)).toBe(status);
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(sentSms).toHaveLength(0);
  });

  it("answers 404 for a missing member", async () => {
    const res = await decide(2_000_000_000, { decision: "reject" });
    expect(res.status).toBe(404);
  });

  it("sends one set of notices for concurrent accepts", async () => {
    fakeNetgsm();
    const id = await createApplicant("candidate");

    const results = await Promise.all([decide(id, ACCEPT), decide(id, ACCEPT)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(sentSms).toHaveLength(1);
    expect(await auditRows(id, "application_accept")).toHaveLength(1);
    expect(await auditRows(id, "application_notice")).toHaveLength(1);
  });

  it("requires a date to accept", async () => {
    const id = await createApplicant("candidate");
    const res = await decide(id, { decision: "accept", sectorId: null });
    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("candidate");
  });

  it("refuses a future date", async () => {
    const id = await createApplicant("candidate");
    const res = await decide(id, {
      ...ACCEPT,
      memberLoginDate: "2999-01-01",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Tarih gelecekte olamaz");
    expect(await statusOf(id)).toBe("candidate");
  });

  it("keeps the decision when notices fail", async () => {
    fakeNetgsm(async () => ({ status: 406, body: { code: "40" } }));
    mail.sendEmail.mockRejectedValue(new Error("smtp down"));
    const id = await createApplicant("candidate");

    const res = await decide(id, ACCEPT);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "active",
      notices: { email: "failed", sms: "failed" },
    });
    expect(await statusOf(id)).toBe("active");
  });

  it("handles a deleted sector", async () => {
    fakeNetgsm();
    const sector = await createSector();
    await db.delete(sectorTable).where(eq(sectorTable.id, sector.id));
    const id = await createApplicant("candidate");

    const res = await decide(id, { ...ACCEPT, sectorId: sector.id });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Seçilen sektör bulunamadı");
    expect(await statusOf(id)).toBe("candidate");
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(sentSms).toHaveLength(0);
    expect(await auditRows(id, "application_accept")).toHaveLength(0);
  });

  it("logs notice outcomes without contact details", async () => {
    fakeNetgsm(async () => {
      throw new Error("timeout");
    });
    const id = await createApplicant("candidate");

    await decide(id, ACCEPT);

    const [audit] = await auditRows(id, "application_notice");
    expect(audit.details).toEqual([
      { label: "E-posta", value: "Gönderildi" },
      { label: "SMS", value: "Yanıt alınamadı" },
    ]);
    const text = JSON.stringify(audit);
    const settings = await getApplicationNoticeSettings();
    expect(text).not.toContain(MAIL);
    expect(text).not.toContain("5321112233");
    expect(text).not.toContain("0532");
    const filled = { ad: "Ayşe Yılmaz", firma: "__test__ Karar Firması" };
    for (const template of [
      settings.acceptedSms,
      settings.acceptedEmailSubject,
      settings.acceptedEmailBody,
    ]) {
      expect(text).not.toContain(fillTemplate(template, filled));
    }
  });

  it("notes the dry-run mode in the notice entry", async () => {
    const id = await createApplicant("candidate", { email: null });

    await decide(id, ACCEPT);

    const [audit] = await auditRows(id, "application_notice");
    expect(audit.details).toEqual([
      { label: "E-posta", value: "Adres yok" },
      { label: "SMS", value: "Gönderildi" },
      { label: "Mod", value: "Deneme (SMS gönderilmedi)" },
    ]);
  });
});
