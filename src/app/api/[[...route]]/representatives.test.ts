import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { authorizedRepresentativeTable, memberTable } from "@/db/schema";
import type { MemberStatus } from "@/lib/member-status";
import { membersRoute } from "./members";
import { representativesRoute } from "./representatives";

const createdRepresentativeIds: number[] = [];
const createdMemberIds: number[] = [];

afterAll(async () => {
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
});

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
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
  const res = await representativesRoute.request("/", json("POST", body));
  const resBody = await res.json();
  if (res.status === 201) createdRepresentativeIds.push(resBody.id);
  return { res, body: resBody };
}

async function getRepresentative(id: number) {
  const res = await representativesRoute.request(`/${id}`);
  return { res, body: await res.json() };
}

function patch(id: number, body: Record<string, unknown>) {
  return representativesRoute.request(`/${id}`, json("PATCH", body));
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

  it("rejects the same member twice", async () => {
    const memberId = await createMember("__test__ Tekrar");
    const { res, body } = await createRepresentative({
      name: "__test__ Tekrarlı",
      members: [{ memberId }, { memberId }],
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Aynı üye birden fazla seçilemez");
  });

  it.each([
    "candidate",
    "rejected",
  ] as const)("refuses linking a %s member and saves nothing", async (status) => {
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
  });

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
