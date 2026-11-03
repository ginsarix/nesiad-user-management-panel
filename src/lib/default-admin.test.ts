import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogTable, userTable } from "@/db/schema";
import { ensureDefaultAdmin } from "@/lib/default-admin";
import { sendEmail } from "@/lib/mail";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

const admin = vi.hoisted(() => ({
  email: undefined as string | undefined,
  password: undefined as string | undefined,
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(mod.env, {
      get: (target, key) =>
        key === "DEFAULT_ADMIN_EMAIL"
          ? admin.email
          : key === "DEFAULT_ADMIN_PASSWORD"
            ? admin.password
            : target[key as keyof typeof target],
    }),
  };
});

const createdUserIds: string[] = [];

async function findUser(email: string) {
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email));
  if (user) createdUserIds.push(user.id);
  return user ?? null;
}

// a fresh address per test, so parallel test files never collide
function configure() {
  admin.email = `__test__${crypto.randomUUID()}@example.com`;
  admin.password = "varsayilan-sifre-123";
  return admin.email;
}

beforeEach(() => {
  admin.email = undefined;
  admin.password = undefined;
  vi.mocked(sendEmail).mockClear();
});

afterAll(async () => {
  if (!createdUserIds.length) return;
  // the name is "Admin User", which the global teardown doesn't match
  await db
    .delete(auditLogTable)
    .where(inArray(auditLogTable.entityId, createdUserIds));
  await db.delete(userTable).where(inArray(userTable.id, createdUserIds));
});

describe("ensureDefaultAdmin", () => {
  it("does nothing without DEFAULT_ADMIN_*", async () => {
    expect(await ensureDefaultAdmin()).toBe("not_configured");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("creates a missing admin and emails the verification link", async () => {
    const email = configure();

    expect(await ensureDefaultAdmin()).toBe("created");

    const user = await findUser(email);
    expect(user?.role).toBe("admin");
    expect(user?.emailVerified).toBe(false);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendEmail).mock.calls[0]?.[0].to).toBe(email);
  });

  it("leaves an existing admin alone and sends nothing", async () => {
    const email = configure();
    await ensureDefaultAdmin();
    await findUser(email);
    vi.mocked(sendEmail).mockClear();

    expect(await ensureDefaultAdmin()).toBe("exists");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("keeps the admin when the email fails", async () => {
    const email = configure();
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(await ensureDefaultAdmin()).toBe("created_email_failed");
    expect(await findUser(email)).not.toBeNull();
    consoleError.mockRestore();
  });

  it("creates one admin when two processes start at once", async () => {
    const email = configure();

    const results = await Promise.all([
      ensureDefaultAdmin(),
      ensureDefaultAdmin(),
    ]);

    await findUser(email);
    expect(results.sort()).toEqual(["created", "exists"]);
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});
