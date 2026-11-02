import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "@/lib/auth";
import { auditLogsRoute } from "./audit-logs";
import { cronRoute } from "./cron";
import type { AppEnv } from "./env";
import { filesRoute } from "./files";
import { membersRoute } from "./members";
import { panelUsersRoute } from "./panel-users";
import { representativesRoute } from "./representatives";
import { sectorsRoute } from "./sectors";
import { smsRoute } from "./sms";

/** Every panel API route needs a logged-in user (/api/auth is not routed here) */
const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Oturum açmanız gerekiyor" }, 401);
  // for the audit log's "who"
  c.set("session", session);
  await next();
});

export const app = new Hono<AppEnv>()
  .basePath("/api")
  // before the session check: the scheduled task has no session, only its
  // secret. Hono runs handlers in registration order, so its response ends
  // the chain here
  .route("/cron", cronRoute)
  .use(requireSession)
  .route("/members", membersRoute)
  .route("/sectors", sectorsRoute)
  .route("/representatives", representativesRoute)
  .route("/panel-users", panelUsersRoute)
  .route("/audit-logs", auditLogsRoute)
  .route("/sms", smsRoute)
  .route("/files", filesRoute);

export type AppType = typeof app;
