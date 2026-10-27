import { handle } from "@hono/vercel";
import { Hono } from "hono";
import { membersRoute } from "./members";

const app = new Hono().basePath("/api").route("/members", membersRoute);

export type AppType = typeof app;

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
