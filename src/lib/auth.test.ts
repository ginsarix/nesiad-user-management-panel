import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
  }
});

function testEmail() {
  return `__test__${crypto.randomUUID()}@example.com`;
}

describe("auth configuration", () => {
  it("does not allow signing up", async () => {
    const res = await auth.api.signUpEmail({
      body: { email: testEmail(), password: "bir-sifre-123", name: "__test__" },
      asResponse: true,
    });

    expect(res.ok).toBe(false);
  });

  it("refuses unverified accounts and sends them a link to /welcome", async () => {
    const email = testEmail();
    const { user } = await auth.api.createUser({
      body: { email, password: "verilen-sifre", name: "__test__ Yeni" },
    });
    createdUserIds.push(user.id);

    const res = await auth.api.signInEmail({
      body: { email, password: "verilen-sifre" },
      asResponse: true,
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("EMAIL_NOT_VERIFIED");

    const mail = vi.mocked(sendEmail).mock.calls.at(-1)?.[0];
    expect(mail?.to).toBe(email);
    const link = new URL(mail?.text.match(/https?:\/\/\S+/)?.[0] ?? "");
    expect(link.pathname).toBe("/api/auth/verify-email");
    expect(link.searchParams.get("callbackURL")).toBe("/welcome");
  });
});
