import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { memberTable, sectorTable } from "@/db/schema";
import type { MemberStatus } from "@/lib/member-status";
import { sectorsRoute } from "./sectors";

const createdSectorIds: number[] = [];
const createdMemberIds: number[] = [];

afterAll(async () => {
  if (createdMemberIds.length) {
    await db
      .delete(memberTable)
      .where(inArray(memberTable.id, createdMemberIds));
  }
  if (createdSectorIds.length) {
    await db
      .delete(sectorTable)
      .where(inArray(sectorTable.id, createdSectorIds));
  }
});

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function createSector(name: string) {
  const res = await sectorsRoute.request("/", json("POST", { name }));
  const body = await res.json();
  if (res.status === 201) createdSectorIds.push(body.id);
  return { res, body };
}

async function listSectors() {
  const res = await sectorsRoute.request("/");
  return (await res.json()) as {
    id: number;
    name: string;
    memberCount: number;
  }[];
}

async function createMember(sectorId: number, status: MemberStatus = "active") {
  const [member] = await db
    .insert(memberTable)
    .values({ title: "__test__ Sektör Üyesi", sectorId, status })
    .returning({ id: memberTable.id });
  createdMemberIds.push(member.id);
  return member.id;
}

describe("POST /api/sectors", () => {
  it("creates a sector with a trimmed name", async () => {
    const { res, body } = await createSector("  __test__ Tekstil  ");
    expect(res.status).toBe(201);

    const sector = (await listSectors()).find((s) => s.id === body.id);
    expect(sector).toEqual({
      id: body.id,
      name: "__test__ Tekstil",
      memberCount: 0,
    });
  });

  it("requires a name", async () => {
    const { res, body } = await createSector("   ");
    expect(res.status).toBe(400);
    expect(body.error).toBe("Sektör adı boş olamaz");
  });

  it("rejects a name that differs only in case", async () => {
    await createSector("__test__ Gıda");
    const { res, body } = await createSector("__TEST__ GIDA");
    expect(res.status).toBe(409);
    expect(body.error).toBe("Bu isimde bir sektör zaten var");
  });
});

describe("GET /api/sectors", () => {
  it("sorts in Turkish order and counts members", async () => {
    const { body: cam } = await createSector("__test__ Cam");
    const { body: celik } = await createSector("__test__ Çelik");
    const { body: dokuma } = await createSector("__test__ Dokuma");
    await createMember(celik.id);
    await createMember(celik.id);

    const ids = [cam.id, celik.id, dokuma.id];
    const listed = (await listSectors()).filter((s) => ids.includes(s.id));
    expect(listed.map((s) => [s.name, s.memberCount])).toEqual([
      ["__test__ Cam", 0],
      ["__test__ Çelik", 2],
      ["__test__ Dokuma", 0],
    ]);
  });
});

describe("GET /api/sectors member counts", () => {
  it("counts active and passive members, not candidates or rejected ones", async () => {
    const { body: sector } = await createSector("__test__ Say");
    await createMember(sector.id, "active");
    await createMember(sector.id, "passive");
    await createMember(sector.id, "candidate");
    await createMember(sector.id, "rejected");

    const listed = (await listSectors()).find((s) => s.id === sector.id);
    expect(listed?.memberCount).toBe(2);
  });
});

describe("PATCH /api/sectors/:id", () => {
  it("renames a sector", async () => {
    const { body } = await createSector("__test__ Eski Ad");
    const res = await sectorsRoute.request(
      `/${body.id}`,
      json("PATCH", { name: "__test__ Yeni Ad" }),
    );
    expect(res.status).toBe(200);

    const sector = (await listSectors()).find((s) => s.id === body.id);
    expect(sector?.name).toBe("__test__ Yeni Ad");
  });

  it("rejects renaming to another sector's name", async () => {
    await createSector("__test__ Mobilya");
    const { body } = await createSector("__test__ Kereste");
    const res = await sectorsRoute.request(
      `/${body.id}`,
      json("PATCH", { name: "__test__ mobilya" }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown sector", async () => {
    const res = await sectorsRoute.request(
      "/2147483000",
      json("PATCH", { name: "__test__ Yok" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/sectors/:id", () => {
  it("deletes the sector and leaves its members without one", async () => {
    const { body } = await createSector("__test__ Silinecek");
    const memberId = await createMember(body.id);

    const res = await sectorsRoute.request(`/${body.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    expect((await listSectors()).some((s) => s.id === body.id)).toBe(false);
    const [member] = await db
      .select({ sectorId: memberTable.sectorId })
      .from(memberTable)
      .where(eq(memberTable.id, memberId));
    expect(member.sectorId).toBeNull();
  });

  it("returns 404 for an unknown sector", async () => {
    const res = await sectorsRoute.request("/2147483000", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
