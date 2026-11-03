import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

export type DefaultAdminResult =
  | "not_configured"
  | "exists"
  | "created"
  | "created_email_failed";

/**
 * Creates the default admin from DEFAULT_ADMIN_* when no account has that
 * email, and emails them the verification link. Runs at every server start
 * (src/instrumentation.ts) and from `pnpm db:seed`, so it must be cheap and
 * safe to repeat: an existing account is left alone.
 */
export async function ensureDefaultAdmin(): Promise<DefaultAdminResult> {
  const email = env.DEFAULT_ADMIN_EMAIL;
  const password = env.DEFAULT_ADMIN_PASSWORD;
  if (!email || !password) return "not_configured";

  const { internalAdapter } = await auth.$context;
  if (await internalAdapter.findUserByEmail(email)) return "exists";

  try {
    await auth.api.createUser({
      body: { email, password, name: "Admin User", role: "admin" },
    });
  } catch (error) {
    // Another app process (Passenger can start several) got there first
    if (await internalAdapter.findUserByEmail(email)) return "exists";
    throw error;
  }

  // The link verifies the address and logs in, like a new staff member's
  try {
    await auth.api.sendVerificationEmail({ body: { email } });
    return "created";
  } catch (error) {
    // Not fatal: signing in with the password sends a new link (sendOnSignIn)
    console.error("Default admin: the verification email failed", error);
    return "created_email_failed";
  }
}
