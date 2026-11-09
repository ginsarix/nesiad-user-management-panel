import { createEmailVerificationToken } from "better-auth/api";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { userTable, verificationTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  cleanUpLogins,
  completeLogin,
  cookieHeaders,
  startLogin,
} from "@/test/login";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const createdUserIds: string[] = [];

afterAll(async () => {
  await cleanUpLogins();
  if (createdUserIds.length) {
    await db
      .delete(verificationTable)
      .where(inArray(verificationTable.value, createdUserIds));
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

/** A new, unverified user, as the admin creates them */
async function newUser(password = "verilen-sifre") {
  const email = `__test__${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: {
      email,
      password,
      name: "__test__ Kullanıcı",
      role: "admin",
      data: { phone: "5550000000" },
    },
  });
  createdUserIds.push(user.id);
  return { email, userId: user.id };
}

/** Opens the email verification link, which logs the user in */
async function openVerificationLink(email: string) {
  const { secret } = await auth.$context;
  const token = await createEmailVerificationToken(secret, email);
  const res = await auth.api.verifyEmail({
    query: { token, callbackURL: "/welcome" },
    asResponse: true,
  });
  expect(res.headers.get("location")).toBe("/welcome");
  return cookieHeaders(res);
}

async function signIn(email: string, password: string) {
  return auth.api.signInEmail({ body: { email, password }, asResponse: true });
}

async function status(headers: Headers) {
  return (await auth.api.initialPasswordStatus({ headers })).available;
}

describe("initial password", () => {
  it("can be set once right after the verification link", async () => {
    const { email } = await newUser();
    const headers = await openVerificationLink(email);
    expect(await status(headers)).toBe(true);

    await auth.api.setInitialPassword({
      body: { newPassword: "yeni-sifre-123" },
      headers,
    });

    // the password step passes (it then asks for the code)
    await startLogin(email, "yeni-sifre-123");
    expect((await signIn(email, "verilen-sifre")).ok).toBe(false);

    expect(await status(headers)).toBe(false);
    await expect(
      auth.api.setInitialPassword({
        body: { newPassword: "ikinci-sifre-123" },
        headers,
      }),
    ).rejects.toMatchObject({ body: { code: "INITIAL_PASSWORD_NOT_ALLOWED" } });
  });

  it("is not available after a normal login", async () => {
    const { email } = await newUser();
    await openVerificationLink(email);
    const headers = await completeLogin(email, "verilen-sifre");

    expect(await status(headers)).toBe(false);
    await expect(
      auth.api.setInitialPassword({
        body: { newPassword: "yeni-sifre-123" },
        headers,
      }),
    ).rejects.toMatchObject({ body: { code: "INITIAL_PASSWORD_NOT_ALLOWED" } });
  });

  it("expires 30 minutes after the link", async () => {
    const { email } = await newUser();
    const headers = await openVerificationLink(email);
    const session = await auth.api.getSession({ headers });
    await db
      .update(verificationTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        eq(
          verificationTable.identifier,
          `initial-password:${session?.session.id}`,
        ),
      );

    expect(await status(headers)).toBe(false);
    await expect(
      auth.api.setInitialPassword({
        body: { newPassword: "yeni-sifre-123" },
        headers,
      }),
    ).rejects.toMatchObject({ body: { code: "INITIAL_PASSWORD_NOT_ALLOWED" } });
  });

  it("keeps the permission when the password is too short", async () => {
    const { email } = await newUser();
    const headers = await openVerificationLink(email);

    await expect(
      auth.api.setInitialPassword({ body: { newPassword: "kisa" }, headers }),
    ).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_SHORT" } });

    expect(await status(headers)).toBe(true);
  });

  it("logs out other sessions but keeps the current one", async () => {
    const { email } = await newUser();
    const headers = await openVerificationLink(email);
    const otherHeaders = await completeLogin(email, "verilen-sifre");
    expect(await auth.api.getSession({ headers: otherHeaders })).not.toBeNull();

    await auth.api.setInitialPassword({
      body: { newPassword: "yeni-sifre-123" },
      headers,
    });

    expect(await auth.api.getSession({ headers })).not.toBeNull();
    expect(await auth.api.getSession({ headers: otherHeaders })).toBeNull();
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
