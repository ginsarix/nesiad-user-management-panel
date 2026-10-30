import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";

/** How long after logging in a password can be set without the current one */
export const INITIAL_PASSWORD_WINDOW_MS = 30 * 60 * 1000;

/**
 * Lets a user replace the password the admin gave them right after the
 * verification link logged them in, without typing the current one.
 *
 * Relies on better-auth's internal adapter (the same call its admin plugin's
 * setUserPassword uses), which isn't a public API: if an upgrade breaks it,
 * initial-password.test.ts fails.
 */
export const initialPassword = () =>
  ({
    id: "initial-password",
    endpoints: {
      setInitialPassword: createAuthEndpoint(
        "/initial-password/set",
        {
          method: "POST",
          body: z.object({ newPassword: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { session } = ctx.context.session;
          const sessionAge = Date.now() - new Date(session.createdAt).getTime();
          if (sessionAge >= INITIAL_PASSWORD_WINDOW_MS) {
            throw new APIError("FORBIDDEN", {
              code: "SESSION_NOT_FRESH",
              message: "Session is not fresh",
            });
          }

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

          const hash = await ctx.context.password.hash(newPassword);
          await ctx.context.internalAdapter.updatePassword(
            session.userId,
            hash,
          );

          return ctx.json({ status: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
