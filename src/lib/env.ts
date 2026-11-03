import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";
import { safeNumSchema } from "./zod-schemas/shared";

export const env = createEnv({
  // Set only for `next build` in CI, so the build doesn't need the production
  // secrets; src/instrumentation.ts validates when the server starts
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),

    // Only needed by the seed script (src/scripts/seed.ts)
    DEFAULT_ADMIN_EMAIL: z.email().optional(),
    DEFAULT_ADMIN_PASSWORD: z.string().min(8).max(128).optional(),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: safeNumSchema().optional(),
    SMTP_SECURE: z.stringbool().optional(),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    SMTP_FROM: z.string().min(1),

    NETGSM_USERNAME: z.string().min(1),
    NETGSM_PASSWORD: z.string().min(1),
    NETGSM_HEADER: z.string().min(1),
    // true unless set to "false": SMS go to a fake client, nothing is sent
    SMS_DRY_RUN: z.stringbool().default(true),
    // the Plesk scheduled task sends it to POST /api/cron/sms; without it the
    // endpoint refuses every call
    CRON_SECRET: z.string().min(32).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
