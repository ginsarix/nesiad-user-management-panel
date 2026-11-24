import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { LATEST_RELEASE_ID } from "@/lib/release-notes";
import type { AppEnv } from "./env";

export const releaseNotesRoute = new Hono<AppEnv>()
  // The caller has seen the release notes up to the newest version. The id
  // comes from the running code, never the request. No audit entry: which
  // notes someone has seen is their own panel state, not a change (see the
  // audit rules in CLAUDE.md)
  .post("/seen", async (c) => {
    await db
      .update(userTable)
      .set({ releaseNotesSeen: LATEST_RELEASE_ID })
      .where(eq(userTable.id, c.get("session").user.id));
    return c.body(null, 204);
  });
