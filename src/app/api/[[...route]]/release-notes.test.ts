import { and, eq, gte, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogTable, userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { LATEST_RELEASE_ID } from "@/lib/release-notes";
import { cleanUpLogins, completeLogin } from "@/test/login";
import type { AppEnv } from "./env";
import { releaseNotesRoute } from "./release-notes";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const PASSWORD = "verilen-sifre";
const createdUserIds: string[] = [];

let me: { id: string; email: string };
let other: { id: string; email: string };
let cookies: Headers;

/** releaseNotesRoute behind a real session, as app.ts sets it */
const testApp = new Hono<AppEnv>()
  .use(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) c.set("session", session);
    await next();
  })
  .route("/", releaseNotesRoute);

async function newUser() {
  const email = `__test__release-notes-${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: {
      email,
      password: PASSWORD,
      name: "__test__ Sürüm Notları",
      data: { phone: "5550000009" },
    },
  });
  createdUserIds.push(user.id);
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.id, user.id));
  return { id: user.id, email };
}

async function seenOf(userId: string) {
  const [row] = await db
    .select({ seen: userTable.releaseNotesSeen })
    .from(userTable)
    .where(eq(userTable.id, userId));
  return row.seen;
}

function setSeen(userId: string, seen: string | null) {
  return db
    .update(userTable)
    .set({ releaseNotesSeen: seen })
    .where(eq(userTable.id, userId));
}

const markSeen = () =>
  testApp.request("/seen", { method: "POST", headers: cookies });

beforeAll(async () => {
  me = await newUser();
  other = await newUser();
  cookies = await completeLogin(me.email, PASSWORD);
});

afterAll(async () => {
  await cleanUpLogins(createdUserIds);
  await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
});

it("starts a new account at the newest version", async () => {
  expect(await seenOf(other.id)).toBe(LATEST_RELEASE_ID);
});

it("marks only the caller's notes seen, and the session carries the id", async () => {
  await setSeen(me.id, null);
  await setSeen(other.id, "2026-01-01");

  const res = await markSeen();
  expect(res.status).toBe(204);
  expect(await seenOf(me.id)).toBe(LATEST_RELEASE_ID);
  expect(await seenOf(other.id)).toBe("2026-01-01");

  const session = await auth.api.getSession({ headers: cookies });
  expect(session?.user.releaseNotesSeen).toBe(LATEST_RELEASE_ID);
});

it("writes no audit entry", async () => {
  await setSeen(me.id, null);
  const before = new Date();

  expect((await markSeen()).status).toBe(204);
  const rows = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.actorId, me.id),
        gte(auditLogTable.createdAt, before),
      ),
    );
  expect(rows).toEqual([]);
});
