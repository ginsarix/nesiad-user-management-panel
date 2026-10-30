import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { memberTable } from "@/db/schema";
import { deleteFile, readStoredFile } from "@/lib/file-storage";
import { filesRoute } from "./files";
import { membersRoute } from "./members";

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const createdIds: number[] = [];
const createdFiles: string[] = [];

afterAll(async () => {
  if (createdIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.id, createdIds));
  }
  await Promise.all(createdFiles.map(deleteFile));
});

function form(fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return body;
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
      sector: "",
      phone: "0384 000 00 00",
    });
    expect(res.status).toBe(201);

    const { body: member } = await getMember(body.id);
    expect(member.title).toBe("__test__ Boş Alanlar");
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
    expect(member.active).toBe(true);
  });

  it("creates a pasif member", async () => {
    const { body } = await createMember({
      title: "__test__ Pasif",
      active: "false",
    });

    const { body: member } = await getMember(body.id);
    expect(member.active).toBe(false);
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

describe("PATCH /api/members/:id", () => {
  it("updates fields and clears blank ones", async () => {
    const { body } = await createMember({
      title: "__test__ Güncellenecek",
      sector: "İnşaat",
    });

    const res = await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ title: "__test__ Güncellendi", sector: "" }),
    });
    expect(res.status).toBe(200);

    const { body: member } = await getMember(body.id);
    expect(member.title).toBe("__test__ Güncellendi");
    expect(member.sector).toBeNull();
  });

  it("switches aktif/pasif without touching other fields", async () => {
    const { body } = await createMember({
      title: "__test__ Durum",
      memberLoginDate: "2014-03-05",
    });

    await membersRoute.request(`/${body.id}`, {
      method: "PATCH",
      body: form({ active: "false" }),
    });

    const { body: member } = await getMember(body.id);
    expect(member.active).toBe(false);
    expect(member.title).toBe("__test__ Durum");
    expect(member.memberLoginDate).toBe("2014-03-05");
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

describe("GET /api/files/:filename", () => {
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
