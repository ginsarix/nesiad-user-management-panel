import { zValidator } from "@hono/zod-validator";
import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  checkPhoneCode,
  consumePhoneCode,
  issuePhoneCode,
  PHONE_CODE_MESSAGES,
} from "@/lib/phone-code";
import { maskPhone } from "@/lib/sms/phone";
import {
  addPanelUserSchema,
  changePanelUserPhoneSchema,
  phoneCodeRequestSchema,
} from "@/lib/zod-schemas/panel-user";
import { type AppEnv, actorOf } from "./env";
import { respondWithFirstIssue } from "./validation";

const idParam = zValidator(
  "param",
  z.object({ id: z.string().min(1) }),
  respondWithFirstIssue,
);

// Everything else about panel users goes through better-auth's admin
// endpoints from the client. Here: creating an account and changing its
// phone, because the number must be proven by an SMS code first (the code
// is tied to the admin's session and the number), and resending the
// verification email.
export const panelUsersRoute = new Hono<AppEnv>()
  .post(
    "/phone-codes",
    zValidator("json", phoneCodeRequestSchema, respondWithFirstIssue),
    async (c) => {
      const { phone, userId } = c.req.valid("json");

      let userName: string | null = null;
      if (userId) {
        const [user] = await db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, userId));
        if (!user) return c.json({ error: "Kullanıcı bulunamadı" }, 404);
        userName = user.name;
      }

      const result = await issuePhoneCode(c.get("session").session.id, phone);
      if (!result.ok) {
        return result.reason === "too_soon"
          ? c.json({ error: "Yeni kod için bir dakika bekleyin" }, 429)
          : c.json({ error: `SMS gönderilemedi: ${result.message}` }, 502);
      }

      await recordAudit(db, {
        actor: actorOf(c),
        action: "phone_code_sent",
        entityType: "panel_user",
        entityId: userId ?? null,
        entityLabel: userName ?? "Yeni kullanıcı",
        details: [{ label: "Telefon", value: maskPhone(phone) }],
      });

      return c.json({ message: "Kod gönderildi" }, 200);
    },
  )
  .post(
    "/",
    zValidator("json", addPanelUserSchema, respondWithFirstIssue),
    async (c) => {
      const { name, email, password, phone, code } = c.req.valid("json");
      const sessionId = c.get("session").session.id;

      // checked but kept until the account exists: a taken e-posta must not
      // cost the admin a new code
      const check = await checkPhoneCode(sessionId, phone, code, {
        consume: false,
      });
      if (check !== "ok") {
        return c.json({ error: PHONE_CODE_MESSAGES[check] }, 400);
      }

      let id: string;
      try {
        // with the admin's cookies, so the audit plugin records who did it;
        // no request object, which the two-factor guard requires
        const { user } = await auth.api.createUser({
          body: { name, email, password, role: "admin", data: { phone } },
          headers: c.req.raw.headers,
        });
        id = user.id;
      } catch (error) {
        if (!isAPIError(error) || error.statusCode >= 500) throw error;
        const errorCode = error.body?.code;
        return c.json(
          {
            error: authErrorMessage({
              code: errorCode,
              status: error.statusCode,
            }),
          },
          errorCode?.startsWith("USER_ALREADY_EXISTS") ? 409 : 400,
        );
      }

      await consumePhoneCode(sessionId, phone);
      return c.json({ id }, 201);
    },
  )
  .put(
    "/:id/phone",
    idParam,
    zValidator("json", changePanelUserPhoneSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const { phone, code } = c.req.valid("json");
      const sessionId = c.get("session").session.id;

      const [user] = await db
        .select({ name: userTable.name, phone: userTable.phone })
        .from(userTable)
        .where(eq(userTable.id, id));
      if (!user) return c.json({ error: "Kullanıcı bulunamadı" }, 404);

      const check = await checkPhoneCode(sessionId, phone, code, {
        consume: false,
      });
      if (check !== "ok") {
        return c.json({ error: PHONE_CODE_MESSAGES[check] }, 400);
      }

      await db.transaction(async (tx) => {
        await tx.update(userTable).set({ phone }).where(eq(userTable.id, id));
        // used up only if the number is saved
        await consumePhoneCode(sessionId, phone, tx);
        // re-saving the same number changes nothing, so nothing is logged.
        // Compared unmasked: two numbers can share their last 4 digits
        if (user.phone === phone) return;
        await recordAudit(tx, {
          actor: actorOf(c),
          action: "phone_change",
          entityType: "panel_user",
          entityId: id,
          entityLabel: user.name,
          changes: [
            {
              label: "Telefon",
              from: maskPhone(user.phone),
              to: maskPhone(phone),
            },
          ],
        });
      });

      return c.json({ message: "Telefon numarası güncellendi" }, 200);
    },
  )
  .post("/:id/verification-email", idParam, async (c) => {
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
  });
