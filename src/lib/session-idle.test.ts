import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "@/app/api/[[...route]]/app";
import { db } from "@/db";
import { sessionTable, userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { cleanUpLogins, completeLogin } from "@/test/login";
import { SESSION_IDLE_SECONDS } from "./session-idle";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const PASSWORD = "verilen-sifre";
const createdUserIds: string[] = [];
let userId: string;
let email: string;

beforeAll(async () => {
  email = `__test__${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: {
      email,
      password: PASSWORD,
      name: "__test__ Oturum",
      data: { phone: "5550000000" },
    },
  });
  userId = user.id;
  createdUserIds.push(user.id);
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.id, user.id));
});

afterAll(async () => {
  await cleanUpLogins(createdUserIds);
  if (createdUserIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

/** The user's only session, freshly logged in; returns its cookie headers */
async function login() {
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
  return completeLogin(email, PASSWORD);
}

async function setExpiry(minutesFromNow: number) {
  await db
    .update(sessionTable)
    .set({ expiresAt: new Date(Date.now() + minutesFromNow * 60 * 1000) })
    .where(eq(sessionTable.userId, userId));
}

async function expiry() {
  const [row] = await db
    .select({ expiresAt: sessionTable.expiresAt })
    .from(sessionTable)
    .where(eq(sessionTable.userId, userId))
    .limit(1);
  return row.expiresAt.getTime();
}

/** What the panel tab's activity report sends */
function browserGetSession(headers: Headers) {
  return auth.handler(
    new Request(`${env.NEXT_PUBLIC_APP_URL}/api/auth/get-session`, {
      headers,
    }),
  );
}

function sessionCookieMaxAge(res: Response) {
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.includes("session_token="));
  return cookie?.match(/Max-Age=(\d+)/i)?.[1];
}

describe("session ends after 30 minutes without use", () => {
  it("is 30 minutes long from login, cookie included", async () => {
    const before = Date.now();
    await login();

    const end = await expiry();
    expect(end - before).toBeGreaterThan((SESSION_IDLE_SECONDS - 60) * 1000);
    expect(end - before).toBeLessThanOrEqual(
      (SESSION_IDLE_SECONDS + 60) * 1000,
    );
  });

  it("isn't extended by API calls, whose cookie can't reach the browser", async () => {
    const headers = await login();
    await setExpiry(10);
    const end = await expiry();

    const res = await app.request("/api/sectors", { headers });

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await expiry()).toBe(end);
  });

  it("is extended by the browser's activity report, cookie renewed", async () => {
    const headers = await login();
    await setExpiry(10);

    const before = Date.now();
    const res = await browserGetSession(headers);

    expect(res.status).toBe(200);
    expect(await expiry()).toBeGreaterThanOrEqual(
      before + (SESSION_IDLE_SECONDS - 1) * 1000,
    );
    expect(sessionCookieMaxAge(res)).toBe(String(SESSION_IDLE_SECONDS));
  });

  it("is refused once ended, by the API and by get-session", async () => {
    const headers = await login();
    await setExpiry(-1);

    expect((await app.request("/api/sectors", { headers })).status).toBe(401);
    const res = await browserGetSession(headers);
    expect(await res.json()).toBeNull();
  });
});
