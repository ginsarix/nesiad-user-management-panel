import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";
import { safeNumSchema } from "./zod-schemas/shared";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),

    DEFAULT_ADMIN_EMAIL: z.email(),
    DEFAULT_ADMIN_PASSWORD: z.string().min(8).max(128),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: safeNumSchema().optional(),
    SMTP_SECURE: z.stringbool().optional(),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    SMTP_FROM: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
