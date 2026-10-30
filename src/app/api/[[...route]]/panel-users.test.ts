import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { panelUsersRoute } from "./panel-users";

const VERIFIED_ID = "__test__verified-panel-user";

afterAll(async () => {
  await db.delete(userTable).where(eq(userTable.id, VERIFIED_ID));
});

// The success path sends a real email, so only the refusals are tested here
describe("POST /api/panel-users/:id/verification-email", () => {
  it("returns 404 for an unknown user", async () => {
    const res = await panelUsersRoute.request(
      "/__test__no-such-user/verification-email",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Kullanıcı bulunamadı");
  });

  it("refuses an already verified user", async () => {
    await db.insert(userTable).values({
      id: VERIFIED_ID,
      name: "__test__ Doğrulanmış",
      email: "__test__verified@example.com",
      emailVerified: true,
    });

    const res = await panelUsersRoute.request(
      `/${VERIFIED_ID}/verification-email`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Bu kullanıcının e-postası zaten doğrulanmış",
    );
  });
});
