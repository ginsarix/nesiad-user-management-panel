import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { fakeNetgsmClient, netgsmClient } from "@/lib/sms/netgsm";
import {
  cleanUpLogins,
  cookieHeaders,
  lastEmailedCode,
  rememberPendingLogin,
  startLogin,
} from "@/test/login";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/sms/netgsm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sms/netgsm")>();
  return { ...actual, netgsmClient: vi.fn(() => actual.fakeNetgsmClient) };
});

const createdUserIds: string[] = [];

afterAll(async () => {
  await cleanUpLogins();
  if (createdUserIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(netgsmClient).mockImplementation(() => fakeNetgsmClient);
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

async function sendCode(headers: Headers, query?: Record<string, string>) {
  await auth.api.sendTwoFactorOTP({ headers, query });
  return lastEmailedCode();
}

async function verify(headers: Headers, code: string) {
  return auth.api.verifyTwoFactorOTP({
    body: { code },
    headers,
    asResponse: true,
  });
}

function sessionCookie(res: Response) {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith("better-auth.session_token="));
}

describe("login with a code after the password", () => {
  it("asks for a code instead of logging in", async () => {
    const { email, userId } = await newUser();
    const res = await auth.api.signInEmail({
      body: { email, password: "verilen-sifre" },
      asResponse: true,
    });
    rememberPendingLogin(res);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ twoFactorRedirect: true });
    // the credential step's session is deleted again; the last cookie
    // written for it clears it
    const sessionCookies = res.headers
      .getSetCookie()
      .filter((c) => c.startsWith("better-auth.session_token="));
    expect(sessionCookies.at(-1) ?? "better-auth.session_token=;").toMatch(
      /^better-auth\.session_token=;/,
    );
    expect(
      await auth.api.getSession({ headers: cookieHeaders(res) }),
    ).toBeNull();

    // set by the database hook when the account was created
    const [row] = await db
      .select({ twoFactorEnabled: userTable.twoFactorEnabled })
      .from(userTable)
      .where(eq(userTable.id, userId));
    expect(row.twoFactorEnabled).toBe(true);
  });

  it("logs in with the emailed code", async () => {
    const { email, userId } = await newUser();
    const headers = await startLogin(email, "verilen-sifre");
    const code = await sendCode(headers);
    expect(code).toMatch(/^\d{6}$/);

    const res = await verify(headers, code);
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(/^better-auth\.session_token=[^;]+/);
    expect((await res.json()).user.id).toBe(userId);
  });

  it("refuses the right code after 5 wrong ones", async () => {
    const { email } = await newUser();
    const headers = await startLogin(email, "verilen-sifre");
    const code = await sendCode(headers);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      expect((await verify(headers, wrong)).status).toBe(401);
    }
    const res = await verify(headers, code);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE");
  });

  it("refuses a code older than 5 minutes", async () => {
    const { email } = await newUser();
    const headers = await startLogin(email, "verilen-sifre");
    const code = await sendCode(headers);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1000);
    const res = await verify(headers, code);
    vi.useRealTimers();

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("OTP_HAS_EXPIRED");
  });

  it("sends by email only when asked, even with a phone and real SMS", async () => {
    const { email, userId } = await newUser();
    await db
      .update(userTable)
      .set({ phone: "5550000000" })
      .where(eq(userTable.id, userId));
    const send = vi.fn(fakeNetgsmClient.send);
    vi.mocked(netgsmClient).mockImplementation(() => ({ dryRun: false, send }));
    const headers = await startLogin(email, "verilen-sifre");
    vi.mocked(sendEmail).mockClear();

    await auth.api.sendTwoFactorOTP({ headers, query: { channel: "email" } });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(email);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends by SMS when the user has a phone and SMS is live", async () => {
    const { email, userId } = await newUser();
    await db
      .update(userTable)
      .set({ phone: "5550000000" })
      .where(eq(userTable.id, userId));
    const send = vi.fn(fakeNetgsmClient.send);
    vi.mocked(netgsmClient).mockImplementation(() => ({ dryRun: false, send }));
    const headers = await startLogin(email, "verilen-sifre");
    vi.mocked(sendEmail).mockClear();

    await auth.api.sendTwoFactorOTP({ headers });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0][0].no).toBe("5550000000");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("only takes the newest code after the password is typed again", async () => {
    const { email } = await newUser();
    const first = await startLogin(email, "verilen-sifre");
    const codeA = await sendCode(first);
    const second = await startLogin(email, "verilen-sifre");
    const codeB = await sendCode(second);

    const old = await verify(second, codeA);
    expect(old.status).toBeGreaterThanOrEqual(400);
    expect(old.status).toBeLessThan(500);

    const res = await verify(second, codeB);
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(/^better-auth\.session_token=[^;]+/);
  });
});
