import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { userTable, verificationTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mail";
import {
  cleanUpLogins,
  completeLogin,
  lastEmailedCode,
  pendingLoginKey,
  startLogin,
} from "@/test/login";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const createdUserIds: string[] = [];

afterAll(async () => {
  await cleanUpLogins(createdUserIds);
  if (createdUserIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

async function newUser() {
  const email = `__test__${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: { email, password: "verilen-sifre", name: "__test__ Kullanıcı" },
  });
  createdUserIds.push(user.id);
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.id, user.id));
  return { email, userId: user.id };
}

/** A request as the browser sends it to the auth handler */
function browserRequest(path: string, headers: Headers, body: unknown = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("origin", env.NEXT_PUBLIC_APP_URL);
  requestHeaders.set("content-type", "application/json");
  return auth.handler(
    new Request(`${env.NEXT_PUBLIC_APP_URL}/api/auth${path}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
    }),
  );
}

/** The error a direct auth.api call throws, as `{ status, code }` */
async function apiError(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    const e = error as { statusCode?: number; body?: { code?: string } };
    return { status: e.statusCode, code: e.body?.code };
  }
  throw new Error("The call succeeded");
}

// Through the handler like the browser: a direct auth.api call rejects on
// a before hook's error even with asResponse
async function send(headers: Headers, query = "") {
  return browserRequest(`/two-factor/send-otp${query}`, headers);
}

async function verify(headers: Headers, code: string) {
  return browserRequest("/two-factor/verify-otp", headers, { code });
}

/** Moves one of this guard's verification rows into the past */
async function expireRow(identifier: string) {
  const rows = await db
    .update(verificationTable)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(verificationTable.identifier, identifier))
    .returning({ id: verificationTable.id });
  expect(rows.length).toBeGreaterThan(0);
}

describe("two-factor guard", () => {
  it("hides the two-factor endpoints the panel doesn't use", async () => {
    const { email } = await newUser();
    const headers = await completeLogin(email, "verilen-sifre");

    for (const path of [
      "/two-factor/enable",
      "/two-factor/disable",
      "/two-factor/get-totp-uri",
      "/two-factor/verify-totp",
      "/two-factor/generate-backup-codes",
      "/two-factor/verify-backup-code",
    ]) {
      const res = await browserRequest(path, headers, {
        password: "verilen-sifre",
        code: "000000",
      });
      expect(res.status, path).toBe(404);
    }
  });

  it("refuses to remember the device when verifying", async () => {
    const { email } = await newUser();
    const headers = await startLogin(email, "verilen-sifre");
    await send(headers);
    const code = lastEmailedCode();

    const res = await browserRequest("/two-factor/verify-otp", headers, {
      code,
      trustDevice: true,
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ALLOWED");
    expect(
      res.headers.getSetCookie().some((c) => c.includes("trust_device=")),
    ).toBe(false);
  });

  it("refuses to remember the device when sending", async () => {
    const { email } = await newUser();
    const headers = await startLogin(email, "verilen-sifre");

    const res = await browserRequest("/two-factor/send-otp", headers, {
      trustDevice: true,
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ALLOWED");
    // and server-side calls the same
    expect(
      await apiError(
        auth.api.sendTwoFactorOTP({ body: { trustDevice: true }, headers }),
      ),
    ).toEqual({ status: 403, code: "NOT_ALLOWED" });
  });

  it("refuses sending without a pending login, even when logged in", async () => {
    const { email } = await newUser();
    const headers = await completeLogin(email, "verilen-sifre");

    const res = await send(headers);

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("INVALID_TWO_FACTOR_COOKIE");
  });

  it("sends one code a minute per pending login", async () => {
    const { email } = await newUser();
    const headers = await startLogin(email, "verilen-sifre");

    expect((await send(headers)).status).toBe(200);
    const again = await send(headers);
    expect(again.status).toBe(429);
    expect((await again.json()).code).toBe("LOGIN_CODE_RESEND_TOO_SOON");

    // a minute later; only this login's row, so parallel tests keep theirs
    await expireRow(`login-code-sent:${pendingLoginKey(headers)}`);
    expect((await send(headers)).status).toBe(200);
  });

  it("locks the code step after 10 wrong codes in a row", async () => {
    const { email, userId } = await newUser();

    // 5 wrong tries per code, so two logins make 10
    for (let login = 0; login < 2; login++) {
      const headers = await startLogin(email, "verilen-sifre");
      expect((await send(headers)).status).toBe(200);
      const code = lastEmailedCode();
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) {
        const res = await verify(headers, wrong);
        expect(res.status).toBe(401);
        expect((await res.json()).code).toBe("INVALID_CODE");
      }
    }

    const headers = await startLogin(email, "verilen-sifre");
    const locked = await verify(headers, "000000");
    expect(locked.status).toBe(429);
    expect((await locked.json()).code).toBe("ACCOUNT_TEMPORARILY_LOCKED");

    // "E-postayla gönder" while locked sends nothing
    vi.mocked(sendEmail).mockClear();
    const lockedSend = await send(headers, "?channel=email");
    expect(lockedSend.status).toBe(429);
    expect((await lockedSend.json()).code).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    expect(sendEmail).not.toHaveBeenCalled();

    // 15 minutes later
    await expireRow(`login-code-failures:${userId}`);
    expect((await send(headers)).status).toBe(200);
    const res = await verify(headers, lastEmailedCode());
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(verificationTable)
      .where(eq(verificationTable.identifier, `login-code-failures:${userId}`));
    expect(rows).toEqual([]);
  });

  it("shows the lock and the cooldown, not the generic 429 message", () => {
    expect(
      authErrorMessage({ status: 429, code: "ACCOUNT_TEMPORARILY_LOCKED" }),
    ).toBe("Çok fazla hatalı kod girildi. 15 dakika sonra tekrar deneyin.");
    expect(
      authErrorMessage({ status: 429, code: "LOGIN_CODE_RESEND_TOO_SOON" }),
    ).toBe("Yeni kod istemek için bir dakika bekleyin.");
    expect(authErrorMessage({ status: 429 })).toBe(
      "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.",
    );
  });

  it("lets only the server create users", async () => {
    const { email } = await newUser();
    const headers = await completeLogin(email, "verilen-sifre");
    const body = {
      email: `__test__${crypto.randomUUID()}@example.com`,
      password: "verilen-sifre",
      name: "__test__ Tarayıcıdan",
    };

    const res = await browserRequest("/admin/create-user", headers, body);
    // cleaned up even when the guard lets it through
    const [created] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, body.email));
    if (created) createdUserIds.push(created.id);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ALLOWED");
    expect(created).toBeUndefined();

    const { user } = await auth.api.createUser({
      body: { ...body, name: "__test__ Sunucudan" },
      headers,
    });
    createdUserIds.push(user.id);
    expect(user.email).toBe(body.email);
  });

  it("lets admins change only the name of a user", async () => {
    const { email } = await newUser();
    const headers = await completeLogin(email, "verilen-sifre");
    const { userId } = await newUser();

    expect(
      await apiError(
        auth.api.adminUpdateUser({
          body: { userId, data: { phone: "5550000000" } },
          headers,
        }),
      ),
    ).toEqual({ status: 403, code: "NOT_ALLOWED" });
    expect(
      await apiError(
        auth.api.adminUpdateUser({
          body: { userId, data: { twoFactorEnabled: false } },
          headers,
        }),
      ),
    ).toEqual({ status: 403, code: "NOT_ALLOWED" });

    const [row] = await db
      .select({
        phone: userTable.phone,
        twoFactorEnabled: userTable.twoFactorEnabled,
      })
      .from(userTable)
      .where(eq(userTable.id, userId));
    expect(row).toEqual({ phone: null, twoFactorEnabled: true });

    const result = await auth.api.adminUpdateUser({
      body: { userId, data: { name: "__test__ Yeni" } },
      headers,
    });
    expect(result.name).toBe("__test__ Yeni");
  });

  it("doesn't let users change their own phone", async () => {
    const { email } = await newUser();
    const headers = await completeLogin(email, "verilen-sifre");

    const res = await browserRequest("/update-user", headers, {
      phone: "5550000000",
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ALLOWED");
  });

  it("doesn't let users turn off their own code step", async () => {
    const { email } = await newUser();
    const headers = await completeLogin(email, "verilen-sifre");

    const res = await browserRequest("/update-user", headers, {
      twoFactorEnabled: false,
    });

    expect(res.status).toBe(403);
  });
});
