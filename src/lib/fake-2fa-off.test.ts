import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";

// vitest.config.ts sets FAKE_2FA=false for every test worker, so the login
// tests get real codes even when the local .env (loaded first by
// dotenv/config) turns FAKE_2FA on for development. fake-2fa.test.ts turns
// it back on for itself.
describe("test run FAKE_2FA guard", () => {
  it("runs every test with real login codes", () => {
    expect(process.env.FAKE_2FA).toBe("false");
    expect(env.FAKE_2FA).toBe(false);
  });
});
