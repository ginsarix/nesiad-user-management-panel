import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "@/lib/auth";
import { applicationsRoute } from "./applications";
import { auditLogsRoute } from "./audit-logs";
import { counterpartiesRoute } from "./counterparties";
import { cronRoute } from "./cron";
import { pgErrorCode } from "./db-errors";
import type { AppEnv } from "./env";
import { filesRoute } from "./files";
import { membersRoute } from "./members";
import { panelUsersRoute } from "./panel-users";
import { parametersRoute } from "./parameters";
import { paymentsRoute } from "./payments";
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
  // the public membership application: unauthenticated, creates candidates only
  .route("/applications", applicationsRoute)
  .use(requireSession)
  .route("/members", membersRoute)
  .route("/sectors", sectorsRoute)
  .route("/parameters", parametersRoute)
  .route("/counterparties", counterpartiesRoute)
  .route("/payments", paymentsRoute)
  .route("/representatives", representativesRoute)
  .route("/panel-users", panelUsersRoute)
  .route("/audit-logs", auditLogsRoute)
  .route("/sms", smsRoute)
  .route("/files", filesRoute)
  // Hono's default handler prints the raw error, and a Postgres constraint
  // error's DETAIL holds the whole row (TC number included)
  .onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(
      "Unexpected API error, code:",
      pgErrorCode(err) ?? (err instanceof Error ? err.name : "unknown"),
    );
    return c.json({ error: "Bir hata oluştu. Lütfen tekrar deneyin." }, 500);
  });

export type AppType = typeof app;
