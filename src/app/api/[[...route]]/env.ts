import type { Context } from "hono";
import type { AuditActor } from "@/lib/audit";
import type { auth } from "@/lib/auth";

/** Set by the session check in app.ts for every panel API route */
export type AppEnv = {
  Variables: { session: typeof auth.$Infer.Session };
};

/** The logged-in user for the audit log; the system when there is none (tests) */
export function actorOf(c: Context<AppEnv>): AuditActor {
  const user = c.get("session")?.user;
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}
