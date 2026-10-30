import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { type AppEnv, actorOf } from "./env";
import { respondWithFirstIssue } from "./validation";

// Everything else about panel users goes through better-auth's admin
// endpoints from the client; this is the one thing they can't do.
export const panelUsersRoute = new Hono<AppEnv>().post(
  "/:id/verification-email",
  zValidator(
    "param",
    z.object({ id: z.string().min(1) }),
    respondWithFirstIssue,
  ),
  async (c) => {
    const { id } = c.req.valid("param");

    const [user] = await db
      .select({
        name: userTable.name,
        email: userTable.email,
        emailVerified: userTable.emailVerified,
      })
      .from(userTable)
      .where(eq(userTable.id, id));

    if (!user) return c.json({ error: "Kullanıcı bulunamadı" }, 404);
    if (user.emailVerified) {
      return c.json(
        { error: "Bu kullanıcının e-postası zaten doğrulanmış" },
        409,
      );
    }

    // Called without the admin's session on purpose: with one, better-auth
    // only sends to the session's own address (EMAIL_MISMATCH)
    await auth.api.sendVerificationEmail({
      body: { email: user.email, callbackURL: "/welcome" },
    });

    await recordAudit(db, {
      actor: actorOf(c),
      action: "verification_email",
      entityType: "panel_user",
      entityId: id,
      entityLabel: user.name,
      details: [{ label: "E-posta", value: user.email }],
    });

    return c.json({ message: "Doğrulama e-postası gönderildi" }, 200);
  },
);
