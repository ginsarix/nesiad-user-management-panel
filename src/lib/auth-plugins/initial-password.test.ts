import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { sessionTable, userTable } from "@/db/schema";
import { auth } from "@/lib/auth";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

/** A verified user, logged in; resolves with headers carrying the session */
async function loggedInUser(password = "verilen-sifre") {
  const email = `__test__${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: {
      email,
      password,
      name: "__test__ Kullanıcı",
      role: "admin",
      data: { emailVerified: true },
    },
  });
  createdUserIds.push(user.id);

  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  return { email, userId: user.id, headers: new Headers({ cookie }) };
}

async function canSignIn(email: string, password: string) {
  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  return res.ok;
}

describe("POST /api/auth/initial-password/set", () => {
  it("sets a new password right after login without the current one", async () => {
    const { email, headers } = await loggedInUser();

    await auth.api.setInitialPassword({
      body: { newPassword: "yeni-sifre-123" },
      headers,
    });

    expect(await canSignIn(email, "yeni-sifre-123")).toBe(true);
    expect(await canSignIn(email, "verilen-sifre")).toBe(false);
  });

  it("logs out other sessions but keeps the current one", async () => {
    const { email, headers } = await loggedInUser();
    const other = await auth.api.signInEmail({
      body: { email, password: "verilen-sifre" },
      asResponse: true,
    });
    const otherHeaders = new Headers({
      cookie: other.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    });

    await auth.api.setInitialPassword({
      body: { newPassword: "yeni-sifre-123" },
      headers,
    });

    expect(await auth.api.getSession({ headers })).not.toBeNull();
    expect(await auth.api.getSession({ headers: otherHeaders })).toBeNull();
  });

  it("refuses once the session is older than 30 minutes", async () => {
    const { email, userId, headers } = await loggedInUser();
    await db
      .update(sessionTable)
      .set({ createdAt: new Date(Date.now() - 31 * 60 * 1000) })
      .where(eq(sessionTable.userId, userId));

    await expect(
      auth.api.setInitialPassword({
        body: { newPassword: "yeni-sifre-123" },
        headers,
      }),
    ).rejects.toMatchObject({ body: { code: "SESSION_NOT_FRESH" } });

    expect(await canSignIn(email, "verilen-sifre")).toBe(true);
  });

  it("rejects passwords shorter than the configured minimum", async () => {
    const { headers } = await loggedInUser();

    await expect(
      auth.api.setInitialPassword({ body: { newPassword: "kisa" }, headers }),
    ).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_SHORT" } });
  });

  it("requires a session", async () => {
    await expect(
      auth.api.setInitialPassword({
        body: { newPassword: "yeni-sifre-123" },
        headers: new Headers(),
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
