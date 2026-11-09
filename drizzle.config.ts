import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: drizzle-kit reports a missing URL itself
    url: process.env.DATABASE_URL!,
  },
});
