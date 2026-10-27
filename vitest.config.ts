import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true, // Automatically reads mappings from tsconfig.json file
  },
});
