import { describe, expect, it, vi } from "vitest";
import { app } from "./app";

const SECRET = "__test__-cron-secret-0123456789abcdef";

const cron = vi.hoisted(() => ({ secret: undefined as string | undefined }));
vi.mock("@/lib/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(mod.env, {
      get: (target, key) =>
        key === "CRON_SECRET"
          ? cron.secret
          : target[key as keyof typeof target],
    }),
  };
});

// the job has its own tests; this file checks only who may start it
vi.mock("@/lib/sms/auto-send", () => ({
  runAutoSms: vi.fn(async () => ({ status: "disabled" })),
}));

function callCron(authorization?: string) {
  return app.request("/api/cron/sms", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("POST /api/cron/sms", () => {
  it("runs the job with the secret and no session", async () => {
    cron.secret = SECRET;
    const res = await callCron(`Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "disabled" });
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer wrong"],
    ["the secret without Bearer", SECRET],
  ])("refuses %s", async (_, authorization) => {
    cron.secret = SECRET;
    const res = await callCron(authorization);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Yetkisiz" });
  });

  it("refuses everything while CRON_SECRET isn't set", async () => {
    cron.secret = undefined;
    const res = await callCron("Bearer ");

    expect(res.status).toBe(503);
  });
});

describe("the rest of the API", () => {
  it("still needs a session", async () => {
    cron.secret = SECRET;
    for (const path of ["/api/sms/contacts", "/api/members"]) {
      const res = await app.request(path, {
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      expect(res.status, path).toBe(401);
    }
  });
});
