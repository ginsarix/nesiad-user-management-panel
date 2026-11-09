import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogTable, userTable, verificationTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { type NetgsmClient, netgsmClient } from "@/lib/sms/netgsm";
import { cleanUpLogins, completeLogin } from "@/test/login";
import type { AppEnv } from "./env";
import { panelUsersRoute } from "./panel-users";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));
// Tests run in dry run (vitest.config.ts); this mock reads the texted codes
vi.mock("@/lib/sms/netgsm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms/netgsm")>()),
  netgsmClient: vi.fn(),
}));

const VERIFIED_ID = "__test__verified-panel-user";
const PASSWORD = "verilen-sifre";

const createdUserIds: string[] = [];
const sentCodes: string[] = [];

const send = vi.fn<NetgsmClient["send"]>(async () => ({
  status: 200,
  body: { code: "00", jobid: "1" },
}));

/** Emails of users the route itself creates in this run */
const RUN = crypto.randomUUID();
let emailCount = 0;
const newEmail = () => `__test__panel-users-${RUN}-${++emailCount}@example.com`;

let admin: { id: string; email: string };
let cookies: Headers;
let sessionId: string;

/** panelUsersRoute behind a real admin's session, as app.ts sets it */
const testApp = new Hono<AppEnv>()
  .use(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) c.set("session", session);
    await next();
  })
  .route("/", panelUsersRoute);

async function newUser() {
  const email = `__test__${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: { email, password: PASSWORD, name: "__test__ Kullanıcı" },
  });
  createdUserIds.push(user.id);
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.id, user.id));
  return { id: user.id, email };
}

beforeAll(async () => {
  vi.mocked(netgsmClient).mockReturnValue({ dryRun: false, send });
  admin = await newUser();
  cookies = await completeLogin(admin.email, PASSWORD);
  const session = await auth.api.getSession({ headers: cookies });
  if (!session) throw new Error("The admin is not logged in");
  sessionId = session.session.id;
});

afterAll(async () => {
  await cleanUpLogins(createdUserIds);
  await db
    .delete(verificationTable)
    .where(like(verificationTable.identifier, `phone-code:${sessionId}:%`));
  await db.delete(userTable).where(eq(userTable.id, VERIFIED_ID));
  // users created through the route have emails like this
  await db
    .delete(userTable)
    .where(
      or(
        inArray(userTable.id, createdUserIds),
        like(userTable.email, `__test__panel-users-${RUN}%`),
      ),
    );
});

function request(method: string, path: string, body: unknown) {
  const headers = new Headers(cookies);
  headers.set("content-type", "application/json");
  return testApp.request(path, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

/** Asks for a code to `phone` and returns the one the fake NetGSM got */
async function requestCode(phone: string, userId?: string) {
  const before = send.mock.calls.length;
  const res = await request("POST", "/phone-codes", { phone, userId });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ message: "Kod gönderildi" });
  expect(send.mock.calls.length).toBe(before + 1);
  const code = send.mock.calls
    .at(-1)?.[0][0]
    ?.msg.match(/kodunuz: (\d{6})/)?.[1];
  if (!code) throw new Error("No phone code was sent");
  sentCodes.push(code);
  return code;
}

const otherCode = (code: string) => (code === "000000" ? "111111" : "000000");

async function lastEntry(action: string, entityId: string | null) {
  const [row] = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.action, action),
        eq(auditLogTable.actorId, admin.id),
        entityId === null ? undefined : eq(auditLogTable.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLogTable.id))
    .limit(1);
  return row;
}

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

describe("panel user phone numbers", () => {
  it("creates a user with the number the code was sent to, in any format", async () => {
    const code = await requestCode("0555 000 00 01");
    expect(await lastEntry("phone_code_sent", null)).toMatchObject({
      entityType: "panel_user",
      entityId: null,
      entityLabel: "Yeni kullanıcı",
      details: [{ label: "Telefon", value: "••• ••• 00 01" }],
    });

    const email = newEmail();
    const res = await request("POST", "/", {
      name: "__test__ Yeni Kullanıcı",
      email,
      password: PASSWORD,
      phone: "+90 555 000 0001",
      code,
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    createdUserIds.push(id);

    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id));
    expect(user.email).toBe(email);
    expect(user.phone).toBe("5550000001");
    expect(user.twoFactorEnabled).toBe(true);

    expect(await lastEntry("create", id)).toMatchObject({
      entityType: "panel_user",
      details: [
        { label: "Ad Soyad", value: "__test__ Yeni Kullanıcı" },
        { label: "E-posta", value: email },
        { label: "Telefon", value: "••• ••• 00 01" },
      ],
    });
  });

  it("refuses a wrong code and creates nobody", async () => {
    const code = await requestCode("5550000003");
    const email = newEmail();
    const res = await request("POST", "/", {
      name: "__test__ Yeni Kullanıcı",
      email,
      password: PASSWORD,
      phone: "5550000003",
      code: otherCode(code),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Kod hatalı" });
    expect(
      await db.select().from(userTable).where(eq(userTable.email, email)),
    ).toEqual([]);
  });

  it("keeps the code when the account can't be created", async () => {
    const code = await requestCode("5550000004");
    const body = {
      name: "__test__ Yeni Kullanıcı",
      email: admin.email,
      password: PASSWORD,
      phone: "5550000004",
      code,
    };
    const taken = await request("POST", "/", body);
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({
      error: "Bu e-posta adresiyle bir kullanıcı zaten var.",
    });

    const res = await request("POST", "/", { ...body, email: newEmail() });
    expect(res.status).toBe(201);
    createdUserIds.push(((await res.json()) as { id: string }).id);
  });

  it("asks for a new code once the code is used", async () => {
    const res = await request("POST", "/", {
      name: "__test__ Yeni Kullanıcı",
      email: newEmail(),
      password: PASSWORD,
      phone: "5550000001",
      code: sentCodes[0],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Kodun süresi doldu, yeni kod isteyin",
    });
  });

  it("changes a user's number once the new number's code is entered", async () => {
    const target = await newUser();
    const code = await requestCode("0555 000 00 02", target.id);
    expect(await lastEntry("phone_code_sent", target.id)).toMatchObject({
      entityLabel: "__test__ Kullanıcı",
      details: [{ label: "Telefon", value: "••• ••• 00 02" }],
    });

    const wrong = await request("PUT", `/${target.id}/phone`, {
      phone: "5550000002",
      code: otherCode(code),
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "Kod hatalı" });

    const res = await request("PUT", `/${target.id}/phone`, {
      phone: "+90 555 000 0002",
      code,
    });
    expect(res.status).toBe(200);

    const [user] = await db
      .select({ phone: userTable.phone })
      .from(userTable)
      .where(eq(userTable.id, target.id));
    expect(user.phone).toBe("5550000002");
    expect(await lastEntry("phone_change", target.id)).toMatchObject({
      entityType: "panel_user",
      entityLabel: "__test__ Kullanıcı",
      changes: [{ label: "Telefon", from: "—", to: "••• ••• 00 02" }],
    });
  });

  it("logs nothing when the number is saved again, but uses up the code", async () => {
    const target = await newUser();
    await db
      .update(userTable)
      .set({ phone: "5550000007" })
      .where(eq(userTable.id, target.id));
    const code = await requestCode("5550000007", target.id);

    const res = await request("PUT", `/${target.id}/phone`, {
      phone: "0555 000 00 07",
      code,
    });
    expect(res.status).toBe(200);
    expect(await lastEntry("phone_change", target.id)).toBeUndefined();

    const again = await request("PUT", `/${target.id}/phone`, {
      phone: "5550000007",
      code,
    });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({
      error: "Kodun süresi doldu, yeni kod isteyin",
    });
  });

  it("logs a new number that ends in the same 4 digits", async () => {
    const target = await newUser();
    await db
      .update(userTable)
      .set({ phone: "5550000008" })
      .where(eq(userTable.id, target.id));
    const code = await requestCode("5551000008", target.id);

    const res = await request("PUT", `/${target.id}/phone`, {
      phone: "5551000008",
      code,
    });
    expect(res.status).toBe(200);
    expect(await lastEntry("phone_change", target.id)).toMatchObject({
      changes: [
        { label: "Telefon", from: "••• ••• 00 08", to: "••• ••• 00 08" },
      ],
    });
  });

  it("returns 404 when changing an unknown user's number", async () => {
    const res = await request("PUT", "/__test__no-such-user/phone", {
      phone: "5550000002",
      code: "123456",
    });
    expect(res.status).toBe(404);
  });

  it("refuses a landline", async () => {
    const before = send.mock.calls.length;
    const res = await request("POST", "/phone-codes", {
      phone: "0384 213 00 00",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cep telefonu numarası girin" });
    expect(send.mock.calls.length).toBe(before);
  });

  it("refuses a second code to the same number within a minute", async () => {
    await requestCode("5550000005");
    const res = await request("POST", "/phone-codes", {
      phone: "0555 000 00 05",
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Yeni kod için bir dakika bekleyin",
    });
  });

  it("reports a failed SMS", async () => {
    send.mockResolvedValueOnce({ status: 200, body: { code: "40" } });
    const res = await request("POST", "/phone-codes", {
      phone: "5550000006",
    });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/^SMS gönderilemedi: /);
  });

  it("never writes a code to the audit log", async () => {
    expect(sentCodes.length).toBeGreaterThan(0);
    // only what an entry says; ids and timestamps hold digit runs too
    const rows = await db
      .select({
        entityLabel: auditLogTable.entityLabel,
        changes: auditLogTable.changes,
        details: auditLogTable.details,
      })
      .from(auditLogTable)
      .where(
        or(
          eq(auditLogTable.actorId, admin.id),
          inArray(auditLogTable.entityId, createdUserIds),
        ),
      );
    expect(rows.length).toBeGreaterThan(0);
    const logged = JSON.stringify(rows);
    for (const code of sentCodes) expect(logged).not.toContain(code);
  });
});
