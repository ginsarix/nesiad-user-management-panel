import { HTTPException } from "hono/http-exception";
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
    ["GET", "/api/audit-logs"],
  ])("%s %s returns 401 without a session", async (method, path) => {
    getSession.mockResolvedValueOnce(null);

    const res = await app.request(path, { method });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Oturum açmanız gerekiyor" });
  });

  it("leaves POST /api/applications open to the public", async () => {
    getSession.mockClear();
    const res = await app.request("/api/applications", {
      method: "POST",
      body: new FormData(),
    });

    expect(res.status).not.toBe(401);
    expect(getSession).not.toHaveBeenCalled();
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

describe("unexpected errors", () => {
  const TC = "10000000146";

  it("answers 500 and never logs the TC number in the error", async () => {
    const error = new Error(`insert failed (${TC})`, {
      cause: { detail: `Key (national_id)=(${TC}) already exists.` },
    });
    getSession.mockRejectedValueOnce(error);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await app.request("/api/members");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Bir hata oluştu. Lütfen tekrar deneyin.",
    });
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TC);
    spy.mockRestore();
  });

  it("keeps the status of an HTTPException", async () => {
    getSession.mockRejectedValueOnce(
      new HTTPException(400, { message: "Geçersiz istek" }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await app.request("/api/members");

    expect(res.status).toBe(400);
    spy.mockRestore();
  });
});
