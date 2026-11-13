import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { netgsmClient } from "@/lib/sms/netgsm";
import { cleanUpLogins, startLogin } from "@/test/login";

// before env.ts is first imported
vi.hoisted(() => {
  process.env.FAKE_2FA = "true";
});

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/sms/netgsm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sms/netgsm")>();
  return { ...actual, netgsmClient: vi.fn(() => actual.fakeNetgsmClient) };
});

const createdUserIds: string[] = [];

afterAll(async () => {
  await cleanUpLogins(createdUserIds);
  if (createdUserIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

async function pendingLogin() {
  const email = `__test__${crypto.randomUUID()}@example.com`;
  const { user } = await auth.api.createUser({
    body: {
      email,
      password: "verilen-sifre",
      name: "__test__ Kullanıcı",
      data: { phone: "5550000000" },
    },
  });
  createdUserIds.push(user.id);
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.id, user.id));
  const headers = await startLogin(email, "verilen-sifre");
  await auth.api.sendTwoFactorOTP({ headers });
  return headers;
}

describe("FAKE_2FA", () => {
  it("accepts 000000 and sends nothing", async () => {
    const headers = await pendingLogin();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(netgsmClient).not.toHaveBeenCalled();
    const res = await auth.api.verifyTwoFactorOTP({
      body: { code: "000000" },
      headers,
      asResponse: true,
    });
    expect(res.status).toBe(200);
  });

  it("still refuses other codes", async () => {
    const headers = await pendingLogin();
    const res = await auth.api.verifyTwoFactorOTP({
      body: { code: "123456" },
      headers,
      asResponse: true,
    });
    expect(res.ok).toBe(false);
  });
});
