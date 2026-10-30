import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogTable } from "@/db/schema";
import { auditLogsRoute } from "./audit-logs";

// An actor that isn't in the user table (as after deleting a panel user);
// rows are removed by src/test/cleanup-audit-log.ts via the __test__ email
const actor = {
  actorId: `__test__${crypto.randomUUID()}`,
  actorName: "__test__ Silinmiş Kullanıcı",
  actorEmail: "__test__deleted@example.com",
};

async function list(query: Record<string, string>) {
  const res = await auditLogsRoute.request(
    `/?${new URLSearchParams(query).toString()}`,
  );
  return res.json();
}

describe("GET /api/audit-logs", () => {
  it("filters by a deleted actor and pages by 50, newest first", async () => {
    await db.insert(auditLogTable).values(
      Array.from({ length: 55 }, (_, i) => ({
        ...actor,
        action: "update",
        entityType: "member",
        entityLabel: `__test__ Kayıt ${i}`,
        createdAt: new Date(Date.UTC(2020, 0, 1, 0, i)),
      })),
    );

    const first = await list({ actor: actor.actorId });
    expect(first.total).toBe(55);
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0].entityLabel).toBe("__test__ Kayıt 54");
    expect(first.actors).toContainEqual({
      id: actor.actorId,
      name: actor.actorName,
    });

    const second = await list({ actor: actor.actorId, page: "2" });
    expect(
      second.rows.map((r: { entityLabel: string }) => r.entityLabel),
    ).toEqual([4, 3, 2, 1, 0].map((i) => `__test__ Kayıt ${i}`));
  });

  it("uses Istanbul days for the date range", async () => {
    const at = (iso: string) => ({
      ...actor,
      action: "login",
      entityType: "auth",
      entityLabel: `__test__ ${iso}`,
      createdAt: new Date(iso),
    });
    await db.insert(auditLogTable).values([
      // 23:30 on 9 March in Istanbul (UTC+3)
      at("2021-03-09T20:30:00Z"),
      // 00:30 on 10 March in Istanbul
      at("2021-03-09T21:30:00Z"),
      // 23:30 on 10 March in Istanbul
      at("2021-03-10T20:30:00Z"),
    ]);

    const { rows } = await list({
      actor: actor.actorId,
      type: "auth",
      from: "2021-03-10",
      to: "2021-03-10",
    });
    expect(rows.map((r: { entityLabel: string }) => r.entityLabel)).toEqual([
      "__test__ 2021-03-10T20:30:00Z",
      "__test__ 2021-03-09T21:30:00Z",
    ]);
  });

  it("searches record names, case-insensitively", async () => {
    const { rows } = await list({
      actor: actor.actorId,
      q: "kayıt 5",
    });
    expect(rows.map((r: { entityLabel: string }) => r.entityLabel)).toEqual(
      expect.arrayContaining(["__test__ Kayıt 54", "__test__ Kayıt 5"]),
    );
  });
});
