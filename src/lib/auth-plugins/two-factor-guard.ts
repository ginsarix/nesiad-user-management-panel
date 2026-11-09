import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins";
import { pendingLoginUser } from "./pending-login";

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** One new login code a minute per pending login */
const RESEND_COOLDOWN_MS = 60 * 1000;
/** This many wrong codes in a row lock the account's code step */
const MAX_FAILURES = 10;
/** How long the lock lasts */
const LOCK_MS = 15 * 60 * 1000;
/** Wrong codes further apart than this don't add up */
const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

const ERROR_CODES = {
  LOGIN_CODE_RESEND_TOO_SOON: {
    code: "LOGIN_CODE_RESEND_TOO_SOON",
    message: "Wait a minute before asking for a new code",
  },
  ACCOUNT_TEMPORARILY_LOCKED: TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED,
  NOT_ALLOWED: { code: "NOT_ALLOWED", message: "Not allowed" },
} as const;

/** The parts of better-auth's twoFactor plugin the panel doesn't use */
const HIDDEN_PATHS = new Set([
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
  "/two-factor/verify-totp",
  "/two-factor/generate-backup-codes",
  "/two-factor/verify-backup-code",
]);

const CODE_PATHS = new Set(["/two-factor/send-otp", "/two-factor/verify-otp"]);

const notAllowed = () => APIError.from("FORBIDDEN", ERROR_CODES.NOT_ALLOWED);

/** Marks a pending login's code as sent; another may go once it runs out */
const sentId = (pendingKey: string) => `login-code-sent:${pendingKey}`;
/** The count of wrong codes in a row, per account */
const failuresId = (userId: string) => `login-code-failures:${userId}`;

/** The row if it hasn't run out; better-auth deletes expired rows lazily */
async function activeRow(ctx: Ctx, identifier: string) {
  const row =
    await ctx.context.internalAdapter.findVerificationValue(identifier);
  return row && row.expiresAt > new Date() ? row : null;
}

async function isLocked(ctx: Ctx, userId: string) {
  const row = await activeRow(ctx, failuresId(userId));
  return !!row && Number(row.value) >= MAX_FAILURES;
}

async function recordFailure(ctx: Ctx, userId: string) {
  const identifier = failuresId(userId);
  const row = await activeRow(ctx, identifier);
  const count = (row ? Number(row.value) || 0 : 0) + 1;
  const value = String(count);
  const expiresAt = new Date(
    Date.now() + (count >= MAX_FAILURES ? LOCK_MS : FAILURE_WINDOW_MS),
  );
  const adapter = ctx.context.internalAdapter;
  if (row) {
    await adapter.updateVerificationByIdentifier(identifier, {
      value,
      expiresAt,
    });
  } else {
    // a run-out count starts again
    await adapter.deleteVerificationByIdentifier(identifier);
    await adapter.createVerificationValue({ identifier, value, expiresAt });
  }
}

/** The request's JSON body as an object; before hooks see it unvalidated */
function bodyOf(ctx: Ctx): Record<string, unknown> {
  const body: unknown = ctx.body;
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Closes what better-auth's twoFactor and admin plugins leave open for this
 * panel, and adds the resend cooldown and the account lock of the code step:
 *
 * - the TOTP, backup code, enable and disable endpoints answer 404;
 * - the code endpoints need a pending login, never remember the device, and
 *   refuse a locked account (the twoFactor plugin's own lock only covers
 *   accounts with a TOTP row, which OTP-only accounts never get);
 * - accounts are created only by the server (the panel's Hono route), and
 *   the admin endpoint may change only a user's name; the phone and the code
 *   step are never set through a user's own request.
 */
export const twoFactorGuard = () =>
  ({
    id: "two-factor-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => HIDDEN_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async () => {
            throw new APIError("NOT_FOUND", {
              code: "NOT_FOUND",
              message: "Not found",
            });
          }),
        },
        {
          matcher: (ctx) => CODE_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            if (bodyOf(ctx).trustDevice) throw notAllowed();

            const pending = await pendingLoginUser(ctx);
            if (!pending) {
              throw APIError.from(
                "UNAUTHORIZED",
                TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
              );
            }
            if (await isLocked(ctx, pending.user.id)) {
              throw APIError.from(
                "TOO_MANY_REQUESTS",
                ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED,
              );
            }

            if (ctx.path !== "/two-factor/send-otp") return;
            if (await activeRow(ctx, sentId(pending.key))) {
              throw APIError.from(
                "TOO_MANY_REQUESTS",
                ERROR_CODES.LOGIN_CODE_RESEND_TOO_SOON,
              );
            }
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: sentId(pending.key),
              value: pending.user.id,
              expiresAt: new Date(Date.now() + RESEND_COOLDOWN_MS),
            });
          }),
        },
        {
          // the panel creates accounts through its own API, which calls
          // auth.api.createUser on the server (no request object there)
          matcher: (ctx) => ctx.path === "/admin/create-user",
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.request) throw notAllowed();
          }),
        },
        {
          // admin's update-user writes `data` straight to the user row
          matcher: (ctx) => ctx.path === "/admin/update-user",
          handler: createAuthMiddleware(async (ctx) => {
            const data = bodyOf(ctx).data;
            const keys =
              data && typeof data === "object" ? Object.keys(data) : [];
            if (keys.some((key) => key !== "name")) throw notAllowed();
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/update-user",
          handler: createAuthMiddleware(async (ctx) => {
            const body = bodyOf(ctx);
            if (
              Object.hasOwn(body, "phone") ||
              Object.hasOwn(body, "twoFactorEnabled")
            ) {
              throw notAllowed();
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/two-factor/verify-otp",
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned;
            if (isAPIError(returned)) {
              if (returned.body?.code !== "INVALID_CODE") return;
              // a wrong code leaves the pending login in place
              const pending = await pendingLoginUser(ctx);
              if (pending) await recordFailure(ctx, pending.user.id);
              return;
            }
            // logged in: the wrong codes in a row are over
            const userId = ctx.context.newSession?.user.id;
            if (userId) {
              await ctx.context.internalAdapter.deleteVerificationByIdentifier(
                failuresId(userId),
              );
            }
          }),
        },
      ],
    },
    $ERROR_CODES: ERROR_CODES,
  }) satisfies BetterAuthPlugin;
