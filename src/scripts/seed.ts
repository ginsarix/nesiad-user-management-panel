// Run with `pnpm db:seed`. The server does the same at every start
// (src/instrumentation.ts); this is for creating the admin without starting it
import { ensureDefaultAdmin } from "@/lib/default-admin";

const MESSAGES = {
  not_configured:
    "Set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in .env to seed the default admin",
  exists: "The default admin already exists; nothing to do",
  created: "Created the default admin and sent the verification email",
  created_email_failed:
    "Created the default admin, but the verification email failed; signing in with the password sends a new one",
} as const;

// Exit explicitly: the database pool would otherwise keep the process alive
ensureDefaultAdmin().then(
  (result) => {
    console.log(MESSAGES[result]);
    process.exit(result === "not_configured" ? 1 : 0);
  },
  (error: unknown) => {
    console.error(
      "Seeding failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  },
);
