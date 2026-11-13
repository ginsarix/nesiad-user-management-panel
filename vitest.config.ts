import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["src/test/global-teardown.ts"],
    // Whatever the local .env says, tests never send real SMS and always get
    // real login codes: vitest sets these in each test worker after
    // dotenv/config has run, so they win. src/lib/sms/netgsm.test.ts and
    // src/lib/fake-2fa-off.test.ts fail if this stops holding.
    env: { SMS_DRY_RUN: "true", FAKE_2FA: "false" },
  },
  resolve: {
    tsconfigPaths: true, // Automatically reads mappings from tsconfig.json file
  },
});
