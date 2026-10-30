import { describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { app } from "./app";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const getSession = vi.mocked(auth.api.getSession);

describe("session check on /api", () => {
  it.each([
    ["GET", "/api/members"],
    ["GET", "/api/members/1"],
    ["POST", "/api/members"],
    ["PATCH", "/api/members/1"],
    ["DELETE", "/api/members/1"],
    ["GET", "/api/files/logo_abc.png"],
  ])("%s %s returns 401 without a session", async (method, path) => {
    getSession.mockResolvedValueOnce(null);

    const res = await app.request(path, { method });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Oturum açmanız gerekiyor" });
  });

  it("passes the request's cookies to better-auth", async () => {
    getSession.mockResolvedValueOnce(null);

    await app.request("/api/members", { headers: { cookie: "a=b" } });

    const { headers } = getSession.mock.calls.at(-1)?.[0] as {
      headers: Headers;
    };
    expect(headers.get("cookie")).toBe("a=b");
  });
});
