import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "@/lib/auth";
import { filesRoute } from "./files";
import { membersRoute } from "./members";
import { panelUsersRoute } from "./panel-users";
import { representativesRoute } from "./representatives";
import { sectorsRoute } from "./sectors";

/** Every panel API route needs a logged-in user (/api/auth is not routed here) */
const requireSession = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Oturum açmanız gerekiyor" }, 401);
  await next();
});

export const app = new Hono()
  .basePath("/api")
  .use(requireSession)
  .route("/members", membersRoute)
  .route("/sectors", sectorsRoute)
  .route("/representatives", representativesRoute)
  .route("/panel-users", panelUsersRoute)
  .route("/files", filesRoute);

export type AppType = typeof app;
