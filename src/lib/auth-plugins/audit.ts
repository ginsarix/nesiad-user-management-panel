import type { BetterAuthPlugin } from "better-auth";
import {
  createAuthMiddleware,
  getIP,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { db } from "@/db";
import { type AuditActor, type AuditEntry, recordAudit } from "../audit";
import { authErrorMessage } from "../auth-errors";
import type { LoginCodeChannel } from "../login-code";
import { pendingLoginUser } from "./pending-login";

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
type User = { id: string; name: string; email: string };

const LOGIN_FAILURE_REASONS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-posta veya şifre hatalı",
  EMAIL_NOT_VERIFIED: "E-posta doğrulanmamış",
  BANNED_USER: "Hesap devre dışı",
};

/** The users an admin endpoint acts on, read before it runs (rename, delete) */
const usersBefore = new WeakMap<object, User | null>();

function toActor(user: User | null | undefined): AuditActor {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function requestInfo(ctx: Ctx) {
  // auth.api calls made on the server may have neither
  const headers = ctx.request?.headers ?? ctx.headers;
  const ip = headers ? getIP(headers, ctx.context.options) : null;
  return {
    // without a proxy header better-auth reports the unspecified address
    ip: ip && /[1-9a-f]/i.test(ip) ? ip : null,
    userAgent: headers?.get("user-agent") ?? null,
  };
}

/** The logged-in user making the request, if any */
async function currentUser(ctx: Ctx): Promise<User | null> {
  return (
    ctx.context.session?.user ??
    ctx.context.newSession?.user ??
    (await getSessionFromCtx(ctx))?.user ??
    null
  );
}

async function findUser(ctx: Ctx, userId: unknown): Promise<User | null> {
  if (typeof userId !== "string") return null;
  return await ctx.context.internalAdapter.findUserById(userId);
}

/** The audit log must never get in the way of logging in */
async function safeRecord(entry: AuditEntry) {
  try {
    await recordAudit(db, entry);
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}

function userFields(user: User) {
  return [
    { label: "Ad Soyad", value: user.name },
    { label: "E-posta", value: user.email },
  ];
}

/** The login waiting for its code, read before the code is checked */
const pendingBefore = new WeakMap<object, User | null>();

/** How each login code went out, noted by sendOTP for the audit entry */
const codeChannels = new WeakMap<object, LoginCodeChannel>();

const CHANNEL_LABELS: Record<LoginCodeChannel, string> = {
  sms: "SMS",
  email: "E-posta",
  email_fallback: "E-posta (SMS gönderilemedi)",
};

/** Notes how a login code was sent, for the audit entry */
export function rememberLoginCodeChannel(
  ctx: { context: object },
  channel: LoginCodeChannel,
): void {
  codeChannels.set(ctx.context, channel);
}

const ADMIN_ACTIONS: Record<string, string> = {
  "/admin/set-user-password": "password_set",
  "/admin/ban-user": "disable",
  "/admin/unban-user": "enable",
};

/**
 * Writes logins, logouts, password events, and panel-user changes made
 * through better-auth to the audit log. Password resets by email are
 * recorded from emailAndPassword.onPasswordReset in auth.ts.
 */
export const auditLog = () =>
  ({
    id: "audit-log",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/two-factor/verify-otp",
          handler: createAuthMiddleware(async (ctx) => {
            try {
              pendingBefore.set(
                ctx.context,
                (await pendingLoginUser(ctx))?.user ?? null,
              );
            } catch (error) {
              console.error("Audit log lookup failed:", error);
            }
          }),
        },
        {
          matcher: (ctx) =>
            ctx.path === "/admin/update-user" ||
            ctx.path === "/admin/remove-user" ||
            ctx.path === "/sign-out",
          handler: createAuthMiddleware(async (ctx) => {
            try {
              // after the request the old name, the user, or the session
              // is gone; ctx.context is the same object in the after hook
              usersBefore.set(
                ctx.context,
                ctx.path === "/sign-out"
                  ? ((await getSessionFromCtx(ctx))?.user ?? null)
                  : await findUser(ctx, ctx.body?.userId),
              );
            } catch (error) {
              console.error("Audit log lookup failed:", error);
            }
          }),
        },
      ],
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            // redirects (the email link) also come back as an APIError
            const returned = ctx.context.returned;
            const failed = isAPIError(returned) && returned.statusCode >= 400;

            switch (ctx.path) {
              case "/sign-in/email": {
                const user = ctx.context.newSession?.user;
                // a correct password only starts the code step; the login
                // is recorded when the code is verified
                if (!failed && !user) return;
                if (failed || !user) {
                  const error = ctx.context.returned as {
                    body?: { code?: string };
                  };
                  const code = error?.body?.code ?? "";
                  await safeRecord({
                    actor: null,
                    action: "login_failed",
                    entityType: "auth",
                    // whatever was typed; capped at an e-posta's max length
                    entityLabel: String(ctx.body?.email ?? "").slice(0, 254),
                    details: [
                      {
                        label: "Neden",
                        value: LOGIN_FAILURE_REASONS[code] ?? (code || "—"),
                      },
                    ],
                    ...requestInfo(ctx),
                  });
                  return;
                }
                await safeRecord({
                  actor: toActor(user),
                  action: "login",
                  entityType: "auth",
                  entityId: user.id,
                  entityLabel: user.name,
                  ...requestInfo(ctx),
                });
                return;
              }

              case "/two-factor/send-otp": {
                if (failed) return;
                const channel = codeChannels.get(ctx.context);
                const pending = (await pendingLoginUser(ctx))?.user;
                if (!channel || !pending) return;
                await safeRecord({
                  actor: toActor(pending),
                  action: "login_code_sent",
                  entityType: "auth",
                  entityId: pending.id,
                  entityLabel: pending.name,
                  details: [{ label: "Kanal", value: CHANNEL_LABELS[channel] }],
                  ...requestInfo(ctx),
                });
                return;
              }

              case "/two-factor/verify-otp": {
                if (failed) {
                  const pending = pendingBefore.get(ctx.context);
                  if (!pending) return;
                  const error = returned as {
                    statusCode: number;
                    body?: { code?: string };
                  };
                  await safeRecord({
                    actor: toActor(pending),
                    action: "login_code_failed",
                    entityType: "auth",
                    entityId: pending.id,
                    entityLabel: pending.name,
                    details: [
                      {
                        label: "Neden",
                        value: authErrorMessage({
                          code: error.body?.code,
                          status: error.statusCode,
                        }),
                      },
                    ],
                    ...requestInfo(ctx),
                  });
                  return;
                }
                const user = ctx.context.newSession?.user;
                if (!user) return;
                await safeRecord({
                  actor: toActor(user),
                  action: "login",
                  entityType: "auth",
                  entityId: user.id,
                  entityLabel: user.name,
                  ...requestInfo(ctx),
                });
                return;
              }

              case "/verify-email": {
                // the email link logs in (autoSignInAfterVerification)
                const user = ctx.context.newSession?.user;
                if (failed || !user) return;
                await safeRecord({
                  actor: toActor(user),
                  action: "login_email_link",
                  entityType: "auth",
                  entityId: user.id,
                  entityLabel: user.name,
                  ...requestInfo(ctx),
                });
                return;
              }

              case "/sign-out": {
                const user = usersBefore.get(ctx.context);
                if (failed || !user) return;
                await safeRecord({
                  actor: toActor(user),
                  action: "logout",
                  entityType: "auth",
                  entityId: user.id,
                  entityLabel: user.name,
                  ...requestInfo(ctx),
                });
                return;
              }

              case "/change-password":
              case "/initial-password/set": {
                if (failed) return;
                const user = await currentUser(ctx);
                if (!user) return;
                await safeRecord({
                  actor: toActor(user),
                  action:
                    ctx.path === "/change-password"
                      ? "password_change"
                      : "initial_password_set",
                  entityType: "auth",
                  entityId: user.id,
                  entityLabel: user.name,
                  ...requestInfo(ctx),
                });
                return;
              }

              case "/admin/create-user": {
                if (failed) return;
                const created =
                  await ctx.context.internalAdapter.findUserByEmail(
                    String(ctx.body?.email ?? ""),
                  );
                if (!created) return;
                await safeRecord({
                  actor: toActor(await currentUser(ctx)),
                  action: "create",
                  entityType: "panel_user",
                  entityId: created.user.id,
                  entityLabel: created.user.name,
                  details: userFields(created.user),
                });
                return;
              }

              case "/admin/update-user": {
                const before = usersBefore.get(ctx.context);
                const name = ctx.body?.data?.name;
                if (failed || !before || typeof name !== "string") return;
                if (name === before.name) return;
                await safeRecord({
                  actor: toActor(await currentUser(ctx)),
                  action: "update",
                  entityType: "panel_user",
                  entityId: before.id,
                  entityLabel: name,
                  changes: [{ label: "Ad Soyad", from: before.name, to: name }],
                });
                return;
              }

              case "/admin/remove-user": {
                const before = usersBefore.get(ctx.context);
                if (failed || !before) return;
                await safeRecord({
                  actor: toActor(await currentUser(ctx)),
                  action: "delete",
                  entityType: "panel_user",
                  entityId: before.id,
                  entityLabel: before.name,
                  details: userFields(before),
                });
                return;
              }

              default: {
                // set password, disable, enable; the client's follow-up
                // /admin/revoke-user-sessions is part of "password_set"
                const action = ADMIN_ACTIONS[ctx.path];
                if (!action || failed) return;
                const target = await findUser(ctx, ctx.body?.userId);
                if (!target) return;
                await safeRecord({
                  actor: toActor(await currentUser(ctx)),
                  action,
                  entityType: "panel_user",
                  entityId: target.id,
                  entityLabel: target.name,
                });
              }
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
