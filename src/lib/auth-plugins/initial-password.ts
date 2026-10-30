import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";

/** How long after the email link the password can be set without the current one */
export const INITIAL_PASSWORD_WINDOW_MS = 30 * 60 * 1000;

/** One-time permission, stored in better-auth's verification table */
function permissionId(sessionId: string) {
  return `initial-password:${sessionId}`;
}

const notAllowed = () =>
  new APIError("FORBIDDEN", {
    code: "INITIAL_PASSWORD_NOT_ALLOWED",
    message: "Initial password can only be set once, right after verification",
  });

/**
 * Lets a user replace the password the admin gave them, without typing the
 * current one, once: right after the email verification link logged them in.
 *
 * The verification link's session gets a one-time permission (30 minutes);
 * a normal login never does. Relies on better-auth's internal adapter (the
 * same calls its admin plugin and password reset use), which isn't a public
 * API: if an upgrade breaks it, initial-password.test.ts fails.
 */
export const initialPassword = () =>
  ({
    id: "initial-password",
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/verify-email",
          handler: createAuthMiddleware(async (ctx) => {
            // set by autoSignInAfterVerification when the link logs in
            const newSession = ctx.context.newSession;
            if (!newSession) return;

            await ctx.context.internalAdapter.createVerificationValue({
              identifier: permissionId(newSession.session.id),
              value: newSession.user.id,
              expiresAt: new Date(Date.now() + INITIAL_PASSWORD_WINDOW_MS),
            });
          }),
        },
      ],
    },
    endpoints: {
      initialPasswordStatus: createAuthEndpoint(
        "/initial-password/status",
        { method: "GET", use: [sessionMiddleware] },
        async (ctx) => {
          const { session } = ctx.context.session;
          const permission =
            await ctx.context.internalAdapter.findVerificationValue(
              permissionId(session.id),
            );

          return ctx.json({
            available:
              !!permission &&
              permission.value === session.userId &&
              permission.expiresAt > new Date(),
          });
        },
      ),
      setInitialPassword: createAuthEndpoint(
        "/initial-password/set",
        {
          method: "POST",
          body: z.object({ newPassword: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { session } = ctx.context.session;
          const id = permissionId(session.id);

          const permission =
            await ctx.context.internalAdapter.findVerificationValue(id);
          if (
            !permission ||
            permission.value !== session.userId ||
            permission.expiresAt <= new Date()
          ) {
            throw notAllowed();
          }

          // Checked before using up the permission, so a typo can be retried
          const { newPassword } = ctx.body;
          const { minPasswordLength, maxPasswordLength } =
            ctx.context.password.config;
          if (newPassword.length < minPasswordLength) {
            throw new APIError("BAD_REQUEST", {
              code: "PASSWORD_TOO_SHORT",
              message: "Password too short",
            });
          }
          if (newPassword.length > maxPasswordLength) {
            throw new APIError("BAD_REQUEST", {
              code: "PASSWORD_TOO_LONG",
              message: "Password too long",
            });
          }

          const account =
            await ctx.context.internalAdapter.findCredentialAccount(
              session.userId,
            );
          if (!account) {
            throw new APIError("BAD_REQUEST", {
              code: "CREDENTIAL_ACCOUNT_NOT_FOUND",
              message: "Credential account not found",
            });
          }

          // Only one request can use the permission
          if (
            !(await ctx.context.internalAdapter.consumeVerificationValue(id))
          ) {
            throw notAllowed();
          }

          const hash = await ctx.context.password.hash(newPassword);
          await ctx.context.internalAdapter.updatePassword(
            session.userId,
            hash,
          );

          // Log out other devices, keep this one
          const otherSessions = (
            await ctx.context.internalAdapter.listSessions(session.userId)
          ).filter((other) => other.token !== session.token);
          if (otherSessions.length) {
            await ctx.context.internalAdapter.deleteSessions(
              otherSessions.map((other) => other.token),
            );
          }

          return ctx.json({ status: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
