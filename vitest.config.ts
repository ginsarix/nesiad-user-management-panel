import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["src/test/global-teardown.ts"],
  },
  resolve: {
    tsconfigPaths: true, // Automatically reads mappings from tsconfig.json file
  },
});
