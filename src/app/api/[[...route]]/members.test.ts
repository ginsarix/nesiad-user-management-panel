import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  collectionTable,
  committeeMemberTable,
  committeeTable,
  companyTable,
  memberTable,
  parameterTable,
  projectPledgeTable,
  projectTable,
  representativeMemberMapTable,
  sectorTable,
  supervisoryBoardMemberTable,
  supervisoryBoardTable,
} from "@/db/schema";
import { getApplicationNoticeSettings } from "@/lib/application-notice-settings";
import { deleteFile, readStoredFile } from "@/lib/file-storage";
import type { NetgsmClient } from "@/lib/sms/netgsm";
import { fillTemplate } from "@/lib/sms/templates";
import {
  deleteTestCashAccounts,
  insertTestCashAccount,
} from "@/test/cash-accounts";
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

// group, parameter and sector names are unique; keep them apart from parallel runs
const suffix = crypto.randomUUID().slice(0, 8);

const createdIds: number[] = [];
const createdCompanyIds: number[] = [];
const createdSectorIds: number[] = [];
const createdFiles: string[] = [];
const committeeIds: number[] = [];
const supervisoryBoardIds: number[] = [];
const parameterIds: number[] = [];
const projectIds: number[] = [];
const cashAccountIds: number[] = [];

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
  if (createdIds.length) {
    await db
      .delete(collectionTable)
      .where(inArray(collectionTable.memberId, createdIds));
  }
  // their taahhütler go with them
  if (projectIds.length) {
    await db.delete(projectTable).where(inArray(projectTable.id, projectIds));
  }
  if (createdIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, createdIds));
  }
  if (createdCompanyIds.length) {
    await db
      .delete(companyTable)
      .where(inArray(companyTable.id, createdCompanyIds));
  }
  if (parameterIds.length) {
    await db
      .delete(parameterTable)
      .where(inArray(parameterTable.id, parameterIds));
  }
  if (createdSectorIds.length) {
    await db
      .delete(sectorTable)
      .where(inArray(sectorTable.id, createdSectorIds));
  }
  await deleteTestCashAccounts(cashAccountIds);
  await Promise.all(createdFiles.map(deleteFile));
});

/** Multipart as the member form sends it: the company and lists as JSON text */
function form(fields: Record<string, unknown>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof File || typeof value === "string") {
      body.append(key, value);
    } else body.append(key, JSON.stringify(value));
  }
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

/** A new company named `title`, as the Firma section sends it */
function newCompany(title: string, fields: Record<string, string> = {}) {
  return { mode: "new", fields: { title, ...fields } };
}

async function getMember(id: number) {
  const res = await membersRoute.request(`/${id}`);
  return { res, body: await res.json() };
}

async function createMember(fields: Record<string, unknown>) {
  const res = await membersRoute.request("/", {
    method: "POST",
    body: form({ firstName: "__test__", lastName: "Üye", ...fields }),
  });
  const body = await res.json();
  if (res.status === 201) {
    createdIds.push(body.id);
    const { body: member } = await getMember(body.id);
    if (member.company) createdCompanyIds.push(member.company.id);
  }
  return { res, body };
}

async function patchMember(id: number, fields: Record<string, unknown>) {
  const res = await membersRoute.request(`/${id}`, {
    method: "PATCH",
    body: form(fields),
  });
  const body = await res.json();
  // a new company made by the edit
  const { body: member } = await getMember(id);
  if (member.company) createdCompanyIds.push(member.company.id);
  return { res, body };
}

async function insertCompany(
  title: string,
  values: Partial<typeof companyTable.$inferInsert> = {},
) {
  const [company] = await db
    .insert(companyTable)
    .values({ title, titleKey: title.toLocaleLowerCase("tr"), ...values })
    .returning();
  createdCompanyIds.push(company.id);
  return company;
}

async function insertMember(values: Partial<typeof memberTable.$inferInsert>) {
  const [member] = await db
    .insert(memberTable)
    .values({ firstName: "__test__", lastName: "Üye", ...values })
    .returning();
  createdIds.push(member.id);
  return member;
}

async function companyRow(id: number) {
  const [row] = await db
    .select()
    .from(companyTable)
    .where(eq(companyTable.id, id));
  return row;
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

async function createSector(name: string) {
  const [sector] = await db
    .insert(sectorTable)
    .values({ name, nameKey: name.toLocaleLowerCase("tr") })
    .returning({ id: sectorTable.id, name: sectorTable.name });
  createdSectorIds.push(sector.id);
  return sector;
}

describe("POST /api/members", () => {
  it("creates a member with a new company", async () => {
    const sector = await createSector(`__test__ Yeni Firma Sektörü ${suffix}`);
    const title = `__test__ Yeni Firma ${suffix}`;
    const { res, body } = await createMember({
      firstName: "  __test__ Ayşe ",
      lastName: "Yılmaz",
      companyRole: "Genel Müdür",
      mobilePhone: "0532 111 22 33",
      company: newCompany(title, {
        phone: "0384 000 00 00",
        sectorId: String(sector.id),
      }),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member).toMatchObject({
      firstName: "__test__ Ayşe",
      lastName: "Yılmaz",
      name: "__test__ Ayşe Yılmaz",
      companyRole: "Genel Müdür",
      mobilePhone: "0532 111 22 33",
      status: "active",
      company: {
        title,
        phone: "0384 000 00 00",
        sectorId: sector.id,
        sectorName: sector.name,
        memberCount: 1,
        otherMembers: [],
      },
    });

    const entry = await lastEntry("member", "create", body.id);
    expect(entry.entityLabel).toBe("__test__ Ayşe Yılmaz");
    expect(entry.details).toEqual(
      expect.arrayContaining([
        { label: "Adı", value: "__test__ Ayşe" },
        { label: "Görev", value: "Genel Müdür" },
        { label: "Firma: Ünvan", value: title },
        { label: "Firma: Sektör", value: sector.name },
        { label: "Firma: Telefon", value: "0384 000 00 00" },
      ]),
    );
  });

  it("creates a member without a company", async () => {
    const { res, body } = await createMember({ lastName: "Firmasız" });
    expect(res.status).toBe(201);
    expect((await getMember(body.id)).body.company).toBeNull();

    const none = await createMember({
      lastName: "Firmasız 2",
      company: { mode: "none" },
    });
    expect(none.res.status).toBe(201);
    expect((await getMember(none.body.id)).body.company).toBeNull();

    const list = await (await membersRoute.request("/")).json();
    const listed = list.find((m: { id: number }) => m.id === body.id);
    expect(listed).toMatchObject({ name: "__test__ Firmasız", company: null });
  });

  it("creates a member on an existing company", async () => {
    const company = await insertCompany(`__test__ Var Olan ${suffix}`);
    const first = await insertMember({
      lastName: "İlk",
      companyId: company.id,
    });

    const { res, body } = await createMember({
      lastName: "İkinci",
      company: {
        mode: "existing",
        id: company.id,
        fields: { title: company.title },
      },
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.company).toMatchObject({
      id: company.id,
      title: company.title,
      memberCount: 2,
      otherMembers: [{ id: first.id, name: "__test__ İlk", status: "active" }],
    });

    const list = await (await membersRoute.request("/")).json();
    const listed = list.find((m: { id: number }) => m.id === body.id);
    expect(listed.company).toMatchObject({
      id: company.id,
      title: company.title,
      memberCount: 2,
    });
  });

  it("refuses a company that doesn't exist", async () => {
    const { res, body } = await createMember({
      company: { mode: "existing", id: 2_000_000_000, fields: { title: "x" } },
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Firma bulunamadı");
  });

  it("requires a first and last name", async () => {
    const first = await createMember({ firstName: "   " });
    expect(first.res.status).toBe(400);
    expect(first.body.error).toBe("Adı boş olamaz");

    const last = await createMember({ lastName: "" });
    expect(last.res.status).toBe(400);
    expect(last.body.error).toBe("Soyadı boş olamaz");
  });

  it("stores blank fields as null", async () => {
    const { body } = await createMember({
      email: "",
      companyRole: " ",
      notes: "",
    });
    const { body: member } = await getMember(body.id);
    expect(member.email).toBeNull();
    expect(member.companyRole).toBeNull();
    expect(member.notes).toBeNull();
    expect(member.photo).toBeNull();
  });

  it("stores real dates and defaults to aktif", async () => {
    const { res, body } = await createMember({
      memberLoginDate: "2014-03-05",
      birthDate: "1980-01-02",
      company: newCompany(`__test__ Tarihli ${suffix}`, {
        foundingDate: "1998-01-01",
      }),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.memberLoginDate).toBe("2014-03-05");
    expect(member.birthDate).toBe("1980-01-02");
    expect(member.company.foundingDate).toBe("1998-01-01");
    expect(member.status).toBe("active");
  });

  it("accepts passive and refuses creating a candidate", async () => {
    const { body } = await createMember({ status: "passive" });
    expect((await getMember(body.id)).body.status).toBe("passive");

    const { res } = await createMember({ status: "candidate" });
    expect(res.status).toBe(400);
  });

  it.each([
    ["05.03.2014", "Geçerli bir tarih girin (gg.aa.yyyy)"],
    ["2024-02-31", "Geçerli bir tarih girin (gg.aa.yyyy)"],
    ["Mart 2014", "Geçerli bir tarih girin (gg.aa.yyyy)"],
    ["2999-01-01", "Tarih gelecekte olamaz"],
  ])("rejects %j as a date", async (memberLoginDate, error) => {
    const { res, body } = await createMember({ memberLoginDate });
    expect(res.status).toBe(400);
    expect(body.error).toBe(error);
  });

  it("rejects a sector that doesn't exist and saves nothing", async () => {
    const title = `__test__ Olmayan Sektör ${suffix}`;
    const { res, body } = await createMember({
      company: newCompany(title, { sectorId: "2147483000" }),
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Seçilen sektör bulunamadı");
    const rows = await db
      .select()
      .from(companyTable)
      .where(eq(companyTable.title, title));
    expect(rows).toEqual([]);
  });

  it("rejects a sector id that isn't a number", async () => {
    const { res, body } = await createMember({
      company: newCompany("__test__ Geçersiz Sektör", { sectorId: "inşaat" }),
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Geçersiz sektör");
  });

  it("refuses a body that isn't multipart", async () => {
    const res = await membersRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "__test__", lastName: "JSON" }),
    });
    expect(res.status).toBe(415);
  });
});

describe("company logo", () => {
  it("logo upload sets the company logo", async () => {
    const { res, body } = await createMember({
      company: newCompany(`__test__ Logolu ${suffix}`),
      logo: pngFile(),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.company.logo).toMatch(/^logo_.+\.png$/);
    createdFiles.push(member.company.logo);
    expect(await readStoredFile(member.company.logo)).not.toBeNull();
    expect(
      (await lastEntry("member", "create", body.id)).details,
    ).toContainEqual({ label: "Firma: Logo", value: "Var" });
  });

  it("logo upload without a company is refused", async () => {
    const created = await createMember({ logo: pngFile() });
    expect(created.res.status).toBe(400);
    expect(created.body.error).toBe("Üyenin firması yok");

    const { body } = await createMember({ lastName: "Logosuz" });
    const patched = await patchMember(body.id, { logo: pngFile() });
    expect(patched.res.status).toBe(400);
    expect(patched.body.error).toBe("Üyenin firması yok");

    const removed = await patchMember(body.id, { removeLogo: "true" });
    expect(removed.res.status).toBe(400);

    const document = await patchMember(body.id, {
      activityDocument: pdfFile("faaliyet.pdf"),
    });
    expect(document.res.status).toBe(400);
  });

  it("rejects a non-image disguised as an image", async () => {
    const fake = new File(["not an image"], "fake.png", { type: "image/png" });
    const { res, body } = await createMember({
      company: newCompany("__test__ Sahte Logo"),
      logo: fake,
    });
    expect(res.status).toBe(415);
    expect(body.error).toBe(
      "Sadece resim, PDF veya SVG dosyaları kabul edilir",
    );
  });

  it("stores a PDF logo's original next to its image", async () => {
    const { res, body } = await createMember({
      company: newCompany(`__test__ PDF Logolu ${suffix}`),
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
    });
    expect(res.status).toBe(201);

    const { company } = (await getMember(body.id)).body;
    createdFiles.push(company.logo, company.logoOriginal);
    expect(company.logo).toMatch(/^logo_.+\.png$/);
    expect(company.logoOriginal).toMatch(/^logo_.+\.pdf$/);
    expect(await readStoredFile(company.logoOriginal)).not.toBeNull();
    expect(
      (await lastEntry("member", "create", body.id)).details,
    ).toContainEqual({ label: "Firma: Logo", value: "Var (PDF)" });
  });

  it("stores an SVG logo's original next to its image", async () => {
    const { res, body } = await createMember({
      company: newCompany(`__test__ SVG Logolu ${suffix}`),
      logo: pngFile(),
      logoOriginal: svgFile(),
    });
    expect(res.status).toBe(201);

    const { company } = (await getMember(body.id)).body;
    createdFiles.push(company.logo, company.logoOriginal);
    expect(company.logoOriginal).toMatch(/^logo_.+\.svg$/);
    expect(
      (await lastEntry("member", "create", body.id)).details,
    ).toContainEqual({ label: "Firma: Logo", value: "Var (SVG)" });
  });

  it("refuses HTML sent as an SVG original", async () => {
    const html = new File(["<html><script>alert(1)</script></html>"], "x.svg", {
      type: "image/svg+xml",
    });
    const { res } = await createMember({
      company: newCompany("__test__ Sahte SVG Logo"),
      logo: pngFile(),
      logoOriginal: html,
    });
    expect(res.status).toBe(415);
  });

  it("refuses an SVG as the logo image itself", async () => {
    const { res } = await createMember({
      company: newCompany("__test__ SVG Resim"),
      logo: svgFile(),
    });
    expect(res.status).toBe(415);
  });

  it("refuses a logo PDF without the image drawn from it", async () => {
    const { res } = await createMember({
      company: newCompany("__test__ Yalnız PDF"),
      logoOriginal: pdfFile("logo.pdf"),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a logo PDF that isn't a PDF", async () => {
    const { res, body } = await createMember({
      company: newCompany("__test__ Sahte PDF Logo"),
      logo: pngFile(),
      logoOriginal: pngFile("logo.pdf"),
    });
    expect(res.status).toBe(415);
    expect(body.error).toBe(
      "Sadece resim, PDF veya SVG dosyaları kabul edilir",
    );
  });

  it("replaces the logo and deletes the old file", async () => {
    const { body } = await createMember({
      company: newCompany(`__test__ Logo Değişimi ${suffix}`),
      logo: pngFile("eski.png"),
    });
    const before = (await getMember(body.id)).body.company;
    createdFiles.push(before.logo);

    const { res } = await patchMember(body.id, { logo: pngFile("yeni.png") });
    expect(res.status).toBe(200);

    const after = (await getMember(body.id)).body.company;
    createdFiles.push(after.logo);
    expect(after.logo).toMatch(/^yeni_.+\.png$/);
    expect(await readStoredFile(before.logo)).toBeNull();
    expect(await readStoredFile(after.logo)).not.toBeNull();
    expect(
      (await lastEntry("member", "update", body.id)).changes,
    ).toContainEqual({
      label: "Firma: Logo",
      from: "Eski logo",
      to: "Yeni logo",
    });
  });

  it("replaces a PDF logo, deleting its image and its PDF", async () => {
    const { body } = await createMember({
      company: newCompany(`__test__ PDF Logo Değişimi ${suffix}`),
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
    });
    const before = (await getMember(body.id)).body.company;
    createdFiles.push(before.logo, before.logoOriginal);

    const { res } = await patchMember(body.id, { logo: pngFile("yeni.png") });
    expect(res.status).toBe(200);

    const after = (await getMember(body.id)).body.company;
    createdFiles.push(after.logo);
    expect(after.logoOriginal).toBeNull();
    expect(await readStoredFile(before.logo)).toBeNull();
    expect(await readStoredFile(before.logoOriginal)).toBeNull();
  });

  it("removes a PDF logo with its PDF", async () => {
    const { body } = await createMember({
      company: newCompany(`__test__ PDF Logo Silme ${suffix}`),
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
    });
    const before = (await getMember(body.id)).body.company;
    createdFiles.push(before.logo, before.logoOriginal);

    await patchMember(body.id, { removeLogo: "true" });

    const after = (await getMember(body.id)).body.company;
    expect(after.logo).toBeNull();
    expect(after.logoOriginal).toBeNull();
    expect(await readStoredFile(before.logo)).toBeNull();
    expect(await readStoredFile(before.logoOriginal)).toBeNull();
  });

  it("puts a logo sent with a new company on that company", async () => {
    const { body } = await createMember({ lastName: "Firmaya Geçen" });
    const title = `__test__ Logolu Yeni Firma ${suffix}`;
    const { res } = await patchMember(body.id, {
      company: newCompany(title),
      logo: pngFile(),
    });
    expect(res.status).toBe(200);

    const { company } = (await getMember(body.id)).body;
    createdFiles.push(company.logo);
    expect(company.title).toBe(title);
    expect(company.logo).toMatch(/^logo_/);
  });
});

describe("member photo", () => {
  it("photo upload and removal", async () => {
    const { res, body } = await createMember({ photo: pngFile("photo.png") });
    expect(res.status).toBe(201);

    const { photo } = (await getMember(body.id)).body;
    createdFiles.push(photo);
    expect(photo).toMatch(/^photo_.+\.png$/);
    expect(await readStoredFile(photo)).not.toBeNull();
    expect(
      (await lastEntry("member", "create", body.id)).details,
    ).toContainEqual({ label: "Fotoğraf", value: "Var" });

    // saved without one keeps it
    await patchMember(body.id, { notes: "not" });
    expect((await getMember(body.id)).body.photo).toBe(photo);

    const replaced = await patchMember(body.id, { photo: pngFile() });
    expect(replaced.res.status).toBe(200);
    const newPhoto = (await getMember(body.id)).body.photo;
    createdFiles.push(newPhoto);
    expect(newPhoto).not.toBe(photo);
    expect(await readStoredFile(photo)).toBeNull();
    expect(
      (await lastEntry("member", "update", body.id)).changes,
    ).toContainEqual({
      label: "Fotoğraf",
      from: "Eski fotoğraf",
      to: "Yeni fotoğraf",
    });

    const removed = await patchMember(body.id, { removePhoto: "true" });
    expect(removed.res.status).toBe(200);
    expect((await getMember(body.id)).body.photo).toBeNull();
    expect(await readStoredFile(newPhoto)).toBeNull();
    expect(
      (await lastEntry("member", "update", body.id)).changes,
    ).toContainEqual({ label: "Fotoğraf", from: "Eski fotoğraf", to: "—" });
  });

  it("rejects a photo that isn't an image", async () => {
    const fake = new File(["<html></html>"], "photo.jpg", {
      type: "image/jpeg",
    });
    const { res, body } = await createMember({ photo: fake });
    expect(res.status).toBe(415);
    expect(body).toEqual({
      error: "Sadece JPG veya PNG fotoğraflar kabul edilir",
    });
  });
});

describe("PATCH /api/members/:id", () => {
  it("updates fields and clears blank ones", async () => {
    const { body } = await createMember({
      email: "eski@ornek.com",
      notes: "Bir not",
    });

    const { res } = await patchMember(body.id, {
      lastName: "Güncellendi",
      email: "",
      poPositiveCardNo: "PO-1",
    });
    expect(res.status).toBe(200);

    const { body: member } = await getMember(body.id);
    expect(member.name).toBe("__test__ Güncellendi");
    expect(member.email).toBeNull();
    expect(member.notes).toBe("Bir not");
    expect(member.poPositiveCardNo).toBe("PO-1");

    const entry = await lastEntry("member", "update", body.id);
    expect(entry.entityLabel).toBe("__test__ Güncellendi");
    expect(entry.changes).toEqual([
      { label: "Soyadı", from: "Üye", to: "Güncellendi" },
      { label: "E-posta", from: "eski@ornek.com", to: "—" },
      { label: "PO Positive Card No", from: "—", to: "PO-1" },
    ]);
  });

  it("switches aktif/pasif without touching other fields", async () => {
    const { body } = await createMember({ memberLoginDate: "2014-03-05" });

    await patchMember(body.id, { status: "passive" });

    const { body: member } = await getMember(body.id);
    expect(member.status).toBe("passive");
    expect(member.memberLoginDate).toBe("2014-03-05");
  });

  it("refuses changing a candidate through PATCH", async () => {
    const candidate = await insertMember({ status: "candidate" });

    const { res, body } = await patchMember(candidate.id, { status: "active" });
    expect(res.status).toBe(409);
    expect(body.error).toBe("Bu üyenin durumu buradan değiştirilemez");
    expect((await getMember(candidate.id)).body.status).toBe("candidate");
  });

  it("still edits other fields of a candidate", async () => {
    const candidate = await insertMember({ status: "candidate" });

    const { res } = await patchMember(candidate.id, { lastName: "Düzenlendi" });
    expect(res.status).toBe(200);

    const { body: member } = await getMember(candidate.id);
    expect(member.lastName).toBe("Düzenlendi");
    expect(member.status).toBe("candidate");
  });

  it("updates shared company fields for every member of it", async () => {
    const company = await insertCompany(`__test__ Ortak ${suffix}`, {
      phone: "0384 111",
    });
    const a = await insertMember({ lastName: "A", companyId: company.id });
    const b = await insertMember({ lastName: "B", companyId: company.id });
    const title = `__test__ Ortak Yeni Ad ${suffix}`;

    const { res } = await patchMember(a.id, {
      company: { mode: "existing", id: company.id, fields: { title } },
    });
    expect(res.status).toBe(200);

    const { body: member } = await getMember(b.id);
    expect(member.company).toMatchObject({
      id: company.id,
      title,
      phone: "0384 111",
      memberCount: 2,
      otherMembers: [{ id: a.id, name: "__test__ A", status: "active" }],
    });

    const entry = await lastEntry("member", "update", a.id);
    expect(entry.entityLabel).toBe("__test__ A");
    expect(entry.changes).toEqual([
      { label: "Firma: Ünvan", from: company.title, to: title },
    ]);
  });

  it("redacts the application's company fields in Firma changes", async () => {
    const { body } = await createMember({
      company: newCompany(`__test__ Gizli Firma ${suffix}`),
    });
    const { company } = (await getMember(body.id)).body;

    await patchMember(body.id, {
      company: {
        mode: "existing",
        id: company.id,
        fields: {
          title: company.title,
          website: "gizli-site.com",
          companyIntro: "Gizli tanıtım",
          employeeCount: "12",
        },
      },
    });

    const entry = await lastEntry("member", "update", body.id);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { label: "Firma: Web Sitesi", from: "—", to: "•••" },
        { label: "Firma: Firma Tanıtımı", from: "—", to: "•••" },
        { label: "Firma: Çalışan Sayısı", from: "—", to: "•••" },
      ]),
    );
    const json = JSON.stringify(entry);
    expect(json).not.toContain("gizli-site");
    expect(json).not.toContain("Gizli tanıtım");
  });

  it("moving a member to no company deletes the orphaned company", async () => {
    const title = `__test__ Yetim ${suffix}`;
    const { body } = await createMember({
      company: newCompany(title),
      logo: pngFile(),
      activityDocument: pdfFile("faaliyet.pdf"),
    });
    const { company } = (await getMember(body.id)).body;
    createdFiles.push(company.logo, company.activityDocument);

    const { res } = await patchMember(body.id, { company: { mode: "none" } });
    expect(res.status).toBe(200);

    expect((await getMember(body.id)).body.company).toBeNull();
    expect(await companyRow(company.id)).toBeUndefined();
    expect(await readStoredFile(company.logo)).toBeNull();
    expect(await readStoredFile(company.activityDocument)).toBeNull();

    expect(
      (await lastEntry("member", "update", body.id)).changes,
    ).toContainEqual({ label: "Firma", from: title, to: "—" });
    const deleted = await lastEntry("company", "delete", company.id);
    expect(deleted.entityLabel).toBe(title);
    expect(deleted.details).toEqual(
      expect.arrayContaining([
        { label: "Ünvan", value: title },
        { label: "Logo", value: "Var" },
        { label: "Faaliyet Belgesi", value: "•••" },
      ]),
    );
  });

  it("moving a member off a shared company keeps it", async () => {
    const company = await insertCompany(`__test__ Kalan ${suffix}`);
    const a = await insertMember({ lastName: "Giden", companyId: company.id });
    await insertMember({ lastName: "Kalan", companyId: company.id });
    const title = `__test__ Yeni Yer ${suffix}`;

    const sector = await createSector(`__test__ Yeni Yer Sektörü ${suffix}`);

    const { res } = await patchMember(a.id, {
      company: newCompany(title, {
        phone: "0384 333",
        sectorId: String(sector.id),
        website: "gizli-yeni.com",
      }),
      logo: pngFile(),
    });
    expect(res.status).toBe(200);

    expect(await companyRow(company.id)).toBeDefined();
    const { body: member } = await getMember(a.id);
    createdFiles.push(member.company.logo);
    expect(member.company.title).toBe(title);
    expect(member.company.id).not.toBe(company.id);
    // the new company is recorded whole on the member's entry
    const entry = await lastEntry("member", "update", a.id);
    expect(entry.changes).toEqual([
      { label: "Firma", from: company.title, to: title },
      { label: "Firma: Ünvan", from: "—", to: title },
      { label: "Firma: Telefon", from: "—", to: "0384 333" },
      { label: "Firma: Sektör", from: "—", to: sector.name },
      { label: "Firma: Web Sitesi", from: "—", to: "•••" },
      { label: "Firma: Logo", from: "—", to: "Var" },
    ]);
    expect(JSON.stringify(entry)).not.toContain("gizli-yeni");
  });

  it("leaves the company alone when company isn't sent", async () => {
    const company = await insertCompany(`__test__ Dokunulmaz ${suffix}`);
    const member = await insertMember({ companyId: company.id });

    const { res } = await patchMember(member.id, { notes: "not" });
    expect(res.status).toBe(200);
    expect((await getMember(member.id)).body.company.id).toBe(company.id);
  });

  it("returns 404 for an unknown member", async () => {
    const res = await membersRoute.request("/999999999", {
      method: "PATCH",
      body: form({ lastName: "Yok" }),
    });
    expect(res.status).toBe(404);
  });
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

/** A committee with these rows, in order */
async function insertCommittee(
  name: string,
  rows: { memberId: number; roleId: number }[],
) {
  const [group] = await db
    .insert(committeeTable)
    .values({ name, nameKey: name.toLocaleLowerCase("tr") })
    .returning({ id: committeeTable.id });
  committeeIds.push(group.id);
  if (rows.length) {
    await db
      .insert(committeeMemberTable)
      .values(
        rows.map((row, position) => ({ ...row, groupId: group.id, position })),
      );
  }
  return group.id;
}

async function committeeRows(groupId: number) {
  return await db
    .select({
      id: committeeMemberTable.id,
      memberId: committeeMemberTable.memberId,
      roleId: committeeMemberTable.roleId,
    })
    .from(committeeMemberTable)
    .where(eq(committeeMemberTable.groupId, groupId))
    .orderBy(asc(committeeMemberTable.position), asc(committeeMemberTable.id));
}

describe("member and Organizasyon", () => {
  it("organizations sent with the member replace only its rows", async () => {
    const member = await insertMember({ lastName: `Kurullu ${suffix}` });
    const other = await insertMember({ lastName: `Diğer ${suffix}` });
    const baskan = await createRole(`__test__ Başkan ${suffix}`);
    const uye = await createRole(`__test__ Üye ${suffix}`);
    const groupName = `__test__ Komite ${suffix}`;
    const groupId = await insertCommittee(groupName, [
      { memberId: other.id, roleId: baskan.id },
      { memberId: member.id, roleId: uye.id },
      { memberId: other.id, roleId: uye.id },
    ]);
    const [, row] = await committeeRows(groupId);

    const boardName = `__test__ Denetim ${suffix}`;
    const [board] = await db
      .insert(supervisoryBoardTable)
      .values({ name: boardName, nameKey: boardName.toLocaleLowerCase("tr") })
      .returning({ id: supervisoryBoardTable.id });
    supervisoryBoardIds.push(board.id);

    const { res } = await patchMember(member.id, {
      organizations: [
        {
          organization: "committee",
          rowId: row.id,
          groupId,
          roleId: baskan.id,
        },
        {
          organization: "supervisory_board",
          rowId: null,
          groupId: board.id,
          roleId: uye.id,
        },
      ],
    });
    expect(res.status).toBe(200);

    // the others keep their rows and places; the kept row is edited in place
    expect(await committeeRows(groupId)).toEqual([
      { id: expect.any(Number), memberId: other.id, roleId: baskan.id },
      { id: row.id, memberId: member.id, roleId: baskan.id },
      { id: expect.any(Number), memberId: other.id, roleId: uye.id },
    ]);
    const boardRows = await db
      .select({ memberId: supervisoryBoardMemberTable.memberId })
      .from(supervisoryBoardMemberTable)
      .where(eq(supervisoryBoardMemberTable.groupId, board.id));
    expect(boardRows).toEqual([{ memberId: member.id }]);

    const { body } = await getMember(member.id);
    expect(body.organizations).toEqual([
      {
        organization: "committee",
        rowId: row.id,
        groupId,
        groupName,
        roleId: baskan.id,
        role: baskan.name,
      },
      {
        organization: "supervisory_board",
        rowId: expect.any(Number),
        groupId: board.id,
        groupName: boardName,
        roleId: uye.id,
        role: uye.name,
      },
    ]);

    expect((await lastEntry("member", "update", member.id)).changes).toEqual([
      {
        label: "Organizasyonlar",
        from: `Komiteler › ${groupName}: ${uye.name}`,
        to: `Komiteler › ${groupName}: ${baskan.name}, Denetim Kurulu › ${boardName}: ${uye.name}`,
      },
    ]);
    expect((await lastEntry("committee", "update", groupId)).changes).toEqual([
      {
        label: "Kişiler",
        from: `__test__ Diğer ${suffix}: ${baskan.name}, __test__ Kurullu ${suffix}: ${uye.name}, __test__ Diğer ${suffix}: ${uye.name}`,
        to: `__test__ Diğer ${suffix}: ${baskan.name}, __test__ Kurullu ${suffix}: ${baskan.name}, __test__ Diğer ${suffix}: ${uye.name}`,
      },
    ]);

    // left out: the rows stay
    await patchMember(member.id, { notes: "not" });
    expect((await getMember(member.id)).body.organizations).toHaveLength(2);
  });

  it("refuses a new group for a member who isn't Aktif", async () => {
    const member = await insertMember({ status: "passive" });
    const role = await createRole(`__test__ Pasif Görev ${suffix}`);
    const groupId = await insertCommittee(
      `__test__ Pasif Komite ${suffix}`,
      [],
    );

    const { res, body } = await patchMember(member.id, {
      organizations: [
        { organization: "committee", rowId: null, groupId, roleId: role.id },
      ],
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Aktif olmayan üye yeni bir gruba eklenemez");
    expect(await committeeRows(groupId)).toEqual([]);
  });
});

describe("GET /api/members/by-representative/:id", () => {
  it("by-representative returns the mapped member", async () => {
    const member = await insertMember({});
    const representativeId = 2_000_000_000 + Math.floor(Math.random() * 1e6);
    await db
      .insert(representativeMemberMapTable)
      .values({ representativeId, memberId: member.id });

    const res = await membersRoute.request(
      `/by-representative/${representativeId}`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: member.id });

    // the map row goes with the member
    await db
      .delete(representativeMemberMapTable)
      .where(
        eq(representativeMemberMapTable.representativeId, representativeId),
      );
  });

  it("returns 404 for a yetkili with no member", async () => {
    const res = await membersRoute.request("/by-representative/2147483000");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/members/:id", () => {
  it("deletes the member, its files and its orphaned company", async () => {
    const title = `__test__ Silinecek ${suffix}`;
    const { body } = await createMember({
      company: newCompany(title),
      logo: pngFile(),
      logoOriginal: pdfFile("logo.pdf"),
      photo: pngFile("photo.png"),
      identityDocument: pdfFile("kimlik.pdf"),
      activityDocument: pdfFile("faaliyet.pdf"),
    });
    const { body: member } = await getMember(body.id);
    const files = [
      member.photo,
      member.identityDocument,
      member.company.logo,
      member.company.logoOriginal,
      member.company.activityDocument,
    ];
    createdFiles.push(...files);
    for (const file of files) {
      expect(await readStoredFile(file)).not.toBeNull();
    }

    const res = await membersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    expect((await getMember(body.id)).res.status).toBe(404);
    expect(await companyRow(member.company.id)).toBeUndefined();
    for (const file of files) expect(await readStoredFile(file)).toBeNull();

    const entry = await lastEntry("member", "delete", body.id);
    expect(entry.entityLabel).toBe("__test__ Üye");
    expect(entry.details).toEqual(
      expect.arrayContaining([
        { label: "Adı", value: "__test__" },
        { label: "Fotoğraf", value: "Var" },
        { label: "Firma: Ünvan", value: title },
        { label: "Firma: Logo", value: "Var (PDF)" },
      ]),
    );
    expect(
      (await lastEntry("company", "delete", member.company.id)).entityLabel,
    ).toBe(title);
  });

  it("keeps a company other members still have", async () => {
    const company = await insertCompany(`__test__ Paylaşılan ${suffix}`);
    const a = await insertMember({ companyId: company.id });
    await insertMember({ companyId: company.id });

    const res = await membersRoute.request(`/${a.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await companyRow(company.id)).toBeDefined();
  });

  it("refuses to delete a member with tahsilat or taahhüt rows", async () => {
    const member = await insertMember({ lastName: "Kayıtlı" });
    const [category] = await db
      .insert(parameterTable)
      .values({
        kind: "collection_category",
        name: `__test__ Aidat ${suffix}`,
        nameKey: `__test__ aidat ${suffix}`,
      })
      .returning({ id: parameterTable.id });
    parameterIds.push(category.id);
    const cashAccountId = await insertTestCashAccount(
      `__test__ Kasa ${suffix}`,
      cashAccountIds,
    );
    const [project] = await db
      .insert(projectTable)
      .values({
        name: `__test__ Proje ${suffix}`,
        number: `__test__ ${suffix}`,
        numberKey: `__test__${suffix}`,
      })
      .returning({ id: projectTable.id });
    projectIds.push(project.id);

    const remove = () =>
      membersRoute.request(`/${member.id}`, { method: "DELETE" });

    await db.insert(collectionTable).values({
      memberId: member.id,
      categoryId: category.id,
      cashAccountId,
      amount: "100.00",
      date: "2026-01-01",
    });
    let res = await remove();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu üyeye ait 1 tahsilat var. Silmek yerine pasif yapabilirsiniz.",
    );

    await db.insert(projectPledgeTable).values({
      projectId: project.id,
      memberId: member.id,
      quantity: 1,
      amount: "50.00",
      position: 0,
    });
    // tahakkuk rows: accruals.test.ts, which owns that table
    res = await remove();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu üyeye ait 1 tahsilat ve 1 taahhüt var. Silmek yerine pasif yapabilirsiniz.",
    );
    expect((await getMember(member.id)).res.status).toBe(200);

    const { body } = await getMember(member.id);
    expect(body.recordCounts).toEqual({
      collections: 1,
      pledges: 1,
      accruals: 0,
    });
  });

  it("deleting a member removes its Organizasyon rows and names them in the audit entry", async () => {
    const member = await insertMember({ lastName: `Kurulda ${suffix}` });
    const role = await createRole(`__test__ Sekreter ${suffix}`);
    const groupName = `__test__ Silinenli ${suffix}`;
    const groupId = await insertCommittee(groupName, [
      { memberId: member.id, roleId: role.id },
    ]);

    const res = await membersRoute.request(`/${member.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    expect(await committeeRows(groupId)).toEqual([]);
    expect(
      (await lastEntry("member", "delete", member.id)).details,
    ).toContainEqual({
      label: "Organizasyonlar",
      value: `Komiteler › ${groupName}: ${role.name}`,
    });
  });

  it("returns 404 for an unknown member", async () => {
    const res = await membersRoute.request("/999999999", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

const TC = "10000000146";
const TC_2 = "10000000220"; // not necessarily valid; only used where unchecked

describe("applicant fields", () => {
  it("never returns the TC number in list or detail", async () => {
    const { body } = await createMember({ nationalId: TC });

    const { body: member } = await getMember(body.id);
    expect(member.nationalIdMasked).toBe("100••••••••");
    expect(member).not.toHaveProperty("nationalId");

    const list = await (await membersRoute.request("/")).json();
    const item = list.find((m: { id: number }) => m.id === body.id);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("nationalId");
    expect(item).not.toHaveProperty("nationalIdMasked");
    expect(item).not.toHaveProperty("identityDocument");
    expect(JSON.stringify(item)).not.toContain(TC);
    expect(JSON.stringify(member)).not.toContain(TC);
  });

  it("returns null masked when there is no TC number", async () => {
    const { body } = await createMember({});
    expect((await getMember(body.id)).body.nationalIdMasked).toBeNull();
  });

  it("reveals the TC number on its own endpoint", async () => {
    const { body } = await createMember({ nationalId: TC });
    const res = await membersRoute.request(`/${body.id}/national-id`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nationalId: TC });

    const missing = await membersRoute.request("/999999999/national-id");
    expect(missing.status).toBe(404);
  });

  it("keeps the TC number when PATCH sends it blank", async () => {
    const { body } = await createMember({ nationalId: TC });
    const { res } = await patchMember(body.id, { nationalId: "" });
    expect(res.status).toBe(200);

    const reveal = await membersRoute.request(`/${body.id}/national-id`);
    expect(await reveal.json()).toEqual({ nationalId: TC });
  });

  it("refuses an invalid TC number", async () => {
    const { res } = await createMember({ nationalId: "10000000147" });
    expect(res.status).toBe(400);

    const { body } = await createMember({});
    const patched = await patchMember(body.id, { nationalId: `${TC_2}9` });
    expect(patched.res.status).toBe(400);
  });

  it("stores the applicant's fields and a normalized website", async () => {
    const { res, body } = await createMember({
      email: "ayse@ornek.com",
      mobilePhone: "0532 111 22 33",
      gender: "female",
      birthDate: "1990-02-03",
      education: "",
      company: newCompany(`__test__ Başvuran ${suffix}`, {
        website: "ornek.com",
        employeeCount: "12",
      }),
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.gender).toBe("female");
    expect(member.birthDate).toBe("1990-02-03");
    expect(member.education).toBeNull();
    expect(member.consentedAt).toBeNull();
    expect(member.company.website).toBe("https://ornek.com");
    expect(member.company.employeeCount).toBe(12);
  });

  it("refuses a javascript: website", async () => {
    const { res } = await createMember({
      company: newCompany("__test__ Kötü Site", {
        website: "javascript:alert(1)",
      }),
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ["email", "değil"],
    ["mobilePhone", "0212 111 22 33"],
    ["gender", "x"],
  ])("refuses an invalid %s", async (field, value) => {
    const { res } = await createMember({ [field]: value });
    expect(res.status).toBe(400);
  });

  it.each(["-1", "1.5", "5321112233", "1e3"])(
    "refuses %j as the employee count",
    async (employeeCount) => {
      const { res } = await createMember({
        company: newCompany("__test__ Geçersiz Sayı", { employeeCount }),
      });
      expect(res.status).toBe(400);
    },
  );

  it("ignores consentedAt from staff", async () => {
    const { body } = await createMember({
      consentedAt: "2020-01-01T00:00:00Z",
    });
    expect((await getMember(body.id)).body.consentedAt).toBeNull();
  });

  it("stores documents and replaces them, removing the old file", async () => {
    const { body } = await createMember({
      identityDocument: pdfFile(),
      company: newCompany(`__test__ Belgeli ${suffix}`),
      activityDocument: pdfFile("faaliyet.pdf"),
    });
    const { body: before } = await getMember(body.id);
    expect(before.identityDocument).toMatch(/^document_.+\.pdf$/);
    expect(before.company.activityDocument).toMatch(/^document_.+\.pdf$/);
    createdFiles.push(before.identityDocument, before.company.activityDocument);

    await patchMember(body.id, {
      identityDocument: pngFile("kimlik.png"),
      activityDocument: pngFile("faaliyet.png"),
    });
    const { body: after } = await getMember(body.id);
    createdFiles.push(after.identityDocument, after.company.activityDocument);
    expect(after.identityDocument).toMatch(/^document_.+\.png$/);
    expect(after.company.activityDocument).toMatch(/^document_.+\.png$/);
    expect(await readStoredFile(before.identityDocument)).toBeNull();
    expect(await readStoredFile(before.company.activityDocument)).toBeNull();
    expect(await readStoredFile(after.identityDocument)).not.toBeNull();

    expect((await lastEntry("member", "update", body.id)).changes).toEqual([
      { label: "Kimlik Belgesi", from: "•••", to: "•••" },
      { label: "Firma: Faaliyet Belgesi", from: "•••", to: "•••" },
    ]);
  });

  it("rejects a non-document upload and changes nothing", async () => {
    const { body } = await createMember({ lastName: "Sahte Belge" });
    const { res } = await patchMember(body.id, {
      lastName: "Sahte Belge Yeni",
      identityDocument: new File(["düz metin"], "a.pdf", {
        type: "application/pdf",
      }),
    });
    expect(res.status).toBe(415);

    const { body: member } = await getMember(body.id);
    expect(member.lastName).toBe("Sahte Belge");
    expect(member.identityDocument).toBeNull();
  });

  it("logs applicant field changes without values", async () => {
    const { body } = await createMember({});
    await patchMember(body.id, {
      birthPlace: "Nevşehir-Gizli",
      referenceName: "Gizli Referans",
      nationalId: TC,
      email: "acik@ornek.com",
    });

    const entry = await lastEntry("member", "update", body.id);
    expect(entry.changes).toEqual([
      { label: "E-posta", from: "—", to: "acik@ornek.com" },
      { label: "Doğum Yeri", from: "—", to: "•••" },
      { label: "TC Kimlik No", from: "—", to: "•••" },
      { label: "Referans", from: "—", to: "•••" },
    ]);
    const json = JSON.stringify(entry);
    expect(json).not.toContain("Nevşehir-Gizli");
    expect(json).not.toContain("Gizli Referans");
    expect(json).not.toContain(TC);
  });

  it("redacts applicant data in the delete entry", async () => {
    const { body } = await createMember({
      birthPlace: "Nevşehir-Gizli",
      nationalId: TC,
      identityDocument: pdfFile(),
    });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.identityDocument);

    const res = await membersRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const entry = await lastEntry("member", "delete", body.id);
    expect(entry.details).toEqual(
      expect.arrayContaining([
        { label: "Doğum Yeri", value: "•••" },
        { label: "TC Kimlik No", value: "•••" },
        { label: "Kimlik Belgesi", value: "•••" },
        { label: "Eğitim Durumu", value: "—" },
      ]),
    );
    const json = JSON.stringify(entry);
    expect(json).not.toContain(TC);
    expect(json).not.toContain("Nevşehir-Gizli");
    expect(await readStoredFile(member.identityDocument)).toBeNull();
  });
});

describe("GET /api/files/:filename", () => {
  it("serves a PDF as application/pdf, uncached for documents", async () => {
    const { body } = await createMember({ identityDocument: pdfFile() });
    const { body: member } = await getMember(body.id);
    createdFiles.push(member.identityDocument);

    const res = await filesRoute.request(`/${member.identityDocument}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("serves an SVG original sandboxed, so it can't run scripts", async () => {
    const { body } = await createMember({
      company: newCompany(`__test__ SVG Servis ${suffix}`),
      logo: pngFile(),
      logoOriginal: svgFile(),
    });
    const { company } = (await getMember(body.id)).body;
    createdFiles.push(company.logo, company.logoOriginal);

    const res = await filesRoute.request(`/${company.logoOriginal}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toMatch(
      /^sandbox; default-src 'none'/,
    );

    const png = await filesRoute.request(`/${company.logo}`);
    expect(png.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("serves a stored logo with an image type and the immutable cache header", async () => {
    const { body } = await createMember({
      company: newCompany(`__test__ Dosya ${suffix}`),
      logo: pngFile(),
    });
    const { company } = (await getMember(body.id)).body;
    createdFiles.push(company.logo);

    const res = await filesRoute.request(`/${company.logo}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
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
  const FIRM = "__test__ Karar Firması";

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
    const company = await insertCompany(FIRM);
    const member = await insertMember({
      firstName: "__test__ Ayşe",
      lastName: "Yılmaz",
      status,
      email: MAIL,
      mobilePhone: "0532 111 22 33",
      companyId: company.id,
      ...extra,
    });
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

  const NOTICE_VALUES = { ad: "__test__ Ayşe Yılmaz", firma: FIRM };

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

  async function createDecisionSector() {
    return await createSector(
      `__test__ Karar Sektörü ${Date.now()}${Math.random()}`,
    );
  }

  it("acceptance notice uses the member name and company title", async () => {
    fakeNetgsm();
    const settings = await getApplicationNoticeSettings();
    const withCompany = await createApplicant("candidate");

    expect((await decide(withCompany, ACCEPT)).status).toBe(200);
    expect(sentSms[0].msg).toBe(
      fillTemplate(settings.acceptedSms, {
        ad: "__test__ Ayşe Yılmaz",
        firma: FIRM,
      }),
    );

    // no company: {firma} is empty, {ad} still the member's name
    sentSms.length = 0;
    const alone = await createApplicant("candidate", { companyId: null });
    expect((await decide(alone, ACCEPT)).status).toBe(200);
    expect(sentSms[0].msg).toBe(
      fillTemplate(settings.acceptedSms, {
        ad: "__test__ Ayşe Yılmaz",
        firma: "",
      }),
    );
  });

  it("accepts a candidate", async () => {
    fakeNetgsm();
    const sector = await createDecisionSector();
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
    const { body: member } = await getMember(id);
    expect(member.status).toBe("active");
    expect(member.memberLoginDate).toBe("2026-01-15");
    expect(member.company.sectorId).toBe(sector.id);

    const settings = await getApplicationNoticeSettings();
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendEmail).toHaveBeenCalledWith({
      to: MAIL,
      subject: fillTemplate(settings.acceptedEmailSubject, NOTICE_VALUES),
      text: fillTemplate(settings.acceptedEmailBody, NOTICE_VALUES),
    });
    expect(sentSms).toEqual([
      {
        no: "5321112233",
        msg: fillTemplate(settings.acceptedSms, NOTICE_VALUES),
      },
    ]);

    const [audit] = await auditRows(id, "application_accept");
    expect(audit.entityLabel).toBe("__test__ Ayşe Yılmaz");
    expect(audit.changes).toEqual([
      { label: "Durum", from: "Aday", to: "Aktif" },
      { label: "Üye Giriş Tarihi", from: "—", to: "15.01.2026" },
      { label: "Firma: Sektör", from: "—", to: sector.name },
    ]);
    expect(JSON.stringify(audit)).not.toContain(MAIL);
  });

  it("refuses a sector for an applicant without a company", async () => {
    fakeNetgsm();
    const sector = await createDecisionSector();
    const id = await createApplicant("candidate", { companyId: null });

    const res = await decide(id, { ...ACCEPT, sectorId: sector.id });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Üyenin firması yok");
    expect(await statusOf(id)).toBe("candidate");
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
    expect(mail.sendEmail).toHaveBeenCalledWith({
      to: MAIL,
      subject: fillTemplate(settings.rejectedEmailSubject, NOTICE_VALUES),
      text: fillTemplate(settings.rejectedEmailBody, NOTICE_VALUES),
    });
    expect(sentSms[0].msg).toBe(
      fillTemplate(settings.rejectedSms, NOTICE_VALUES),
    );
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
      fillTemplate(settings.acceptedEmailSubject, NOTICE_VALUES),
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
    const sector = await createDecisionSector();
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
    for (const template of [
      settings.acceptedSms,
      settings.acceptedEmailSubject,
      settings.acceptedEmailBody,
    ]) {
      expect(text).not.toContain(fillTemplate(template, NOTICE_VALUES));
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
