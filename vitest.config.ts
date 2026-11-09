import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["src/test/global-teardown.ts"],
    // Tests never send real SMS, whatever the local .env says: vitest sets
    // these in each test worker after dotenv/config has run, so they win.
    // src/lib/sms/netgsm.test.ts fails if this stops holding.
    env: { SMS_DRY_RUN: "true" },
  },
  resolve: {
    tsconfigPaths: true, // Automatically reads mappings from tsconfig.json file
  },
});
