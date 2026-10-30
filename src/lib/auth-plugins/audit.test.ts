import { createEmailVerificationToken } from "better-auth/api";
import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogTable, userTable } from "@/db/schema";
import { auth } from "@/lib/auth";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

function cookieHeaders(res: Response) {
  return new Headers({
    cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
}

async function newUser(headers?: Headers, { verified = true } = {}) {
  const email = `__test__${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: { email, password: "verilen-sifre", name: "__test__ Kullanıcı" },
    headers,
  });
  createdUserIds.push(user.id);
  if (verified) {
    await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.id, user.id));
  }
  return { email, userId: user.id };
}

async function signIn(email: string, password = "verilen-sifre") {
  return auth.api.signInEmail({ body: { email, password }, asResponse: true });
}

/** The newest audit row for a record and action */
async function lastEntry(action: string, entityId: string) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.action, action),
        eq(auditLogTable.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

describe("audit log of better-auth events", () => {
  it("records a failed login with no actor and the reason", async () => {
    const { email } = await newUser();
    const res = await signIn(email, "yanlis-sifre");
    expect(res.status).toBe(401);

    const [row] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.action, "login_failed"),
          eq(auditLogTable.entityLabel, email),
        ),
      );
    expect(row).toMatchObject({
      actorId: null,
      entityType: "auth",
      details: [{ label: "Neden", value: "E-posta veya şifre hatalı" }],
    });
  });

  it("records logins and logouts by the user", async () => {
    const { email, userId } = await newUser();
    const headers = cookieHeaders(await signIn(email));
    expect(await lastEntry("login", userId)).toMatchObject({
      actorId: userId,
      actorEmail: email,
    });

    await auth.api.signOut({ headers });
    expect(await lastEntry("logout", userId)).toMatchObject({
      actorId: userId,
    });
  });

  it("takes the IP from x-real-ip, never a browser-sent x-forwarded-for", async () => {
    const { email, userId } = await newUser();
    await auth.api.signInEmail({
      body: { email, password: "verilen-sifre" },
      headers: new Headers({
        "x-real-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
        "user-agent": "__test__ browser",
      }),
    });
    expect(await lastEntry("login", userId)).toMatchObject({
      ip: "203.0.113.7",
      userAgent: "__test__ browser",
    });
  });

  it("records a login through the email link", async () => {
    // the link only logs in someone who isn't verified yet
    const { email, userId } = await newUser(undefined, { verified: false });
    const { secret } = await auth.$context;
    const token = await createEmailVerificationToken(secret, email);
    await auth.api.verifyEmail({
      query: { token, callbackURL: "/welcome" },
      asResponse: true,
    });
    expect(await lastEntry("login_email_link", userId)).toMatchObject({
      actorId: userId,
    });
  });

  it("records password changes by the user", async () => {
    const { email, userId } = await newUser();
    const headers = cookieHeaders(await signIn(email));
    await auth.api.changePassword({
      body: {
        currentPassword: "verilen-sifre",
        newPassword: "yeni-sifre-123",
        revokeOtherSessions: true,
      },
      headers,
    });
    expect(await lastEntry("password_change", userId)).toMatchObject({
      actorId: userId,
    });
  });

  it("records the initial password set after the email link", async () => {
    const { email, userId } = await newUser(undefined, { verified: false });
    const { secret } = await auth.$context;
    const token = await createEmailVerificationToken(secret, email);
    const headers = cookieHeaders(
      await auth.api.verifyEmail({
        query: { token, callbackURL: "/welcome" },
        asResponse: true,
      }),
    );
    await auth.api.setInitialPassword({
      body: { newPassword: "ilk-sifre-123" },
      headers,
    });
    expect(await lastEntry("initial_password_set", userId)).toMatchObject({
      actorId: userId,
    });
  });

  it("records a password reset by email as the user", async () => {
    const { email, userId } = await newUser();
    const { sendEmail } = await import("@/lib/mail");
    vi.mocked(sendEmail).mockClear();
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });
    // the token is in the link of the (mocked) email
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled());
    const { text } = vi.mocked(sendEmail).mock.calls[0][0];
    const token = text.match(/reset-password\/([^?\s]+)/)?.[1] ?? "";
    await auth.api.resetPassword({
      body: { newPassword: "sifirlanmis-123", token },
    });
    expect(await lastEntry("password_reset", userId)).toMatchObject({
      actorId: userId,
    });
  });

  it("records panel-user changes with who made them", async () => {
    const admin = await newUser();
    const headers = cookieHeaders(await signIn(admin.email));
    const target = await newUser(headers);

    expect(await lastEntry("create", target.userId)).toMatchObject({
      entityType: "panel_user",
      actorId: admin.userId,
    });

    await auth.api.adminUpdateUser({
      body: { userId: target.userId, data: { name: "__test__ Yeni Ad" } },
      headers,
    });
    // the old name is only known through the before hook
    expect(await lastEntry("update", target.userId)).toMatchObject({
      actorId: admin.userId,
      changes: [
        {
          label: "Ad Soyad",
          from: "__test__ Kullanıcı",
          to: "__test__ Yeni Ad",
        },
      ],
    });

    await auth.api.setUserPassword({
      body: { userId: target.userId, newPassword: "baska-sifre-1" },
      headers,
    });
    expect(await lastEntry("password_set", target.userId)).toMatchObject({
      actorId: admin.userId,
    });

    await auth.api.banUser({ body: { userId: target.userId }, headers });
    expect(await lastEntry("disable", target.userId)).toBeTruthy();

    await auth.api.removeUser({ body: { userId: target.userId }, headers });
    expect(await lastEntry("delete", target.userId)).toMatchObject({
      actorId: admin.userId,
      entityLabel: "__test__ Yeni Ad",
      details: [
        { label: "Ad Soyad", value: "__test__ Yeni Ad" },
        { label: "E-posta", value: target.email },
      ],
    });
  });

  it("records a user created without a session as the system", async () => {
    const { userId } = await newUser();
    expect(await lastEntry("create", userId)).toMatchObject({
      actorId: null,
    });
  });
});
