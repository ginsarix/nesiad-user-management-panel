import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins";
import { desc, eq, sql } from "drizzle-orm";
import { db, type Executor, type Transaction } from "@/db";
import { verificationTable } from "@/db/schema";
import { loginCodeSentTo } from "../login-code";
import { loginCodeChannelOf } from "./login-code-channel";
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
  LOGIN_CODE_NOT_SENT: {
    code: "LOGIN_CODE_NOT_SENT",
    message: "The login code could not be sent by SMS or email",
  },
  ACCOUNT_TEMPORARILY_LOCKED: TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED,
  NOT_ALLOWED: { code: "NOT_ALLOWED", message: "Not allowed" },
} as const;

/**
 * The parts of better-auth's twoFactor and admin plugins the panel doesn't
 * use. Impersonation would let any account (all are admins) take another's
 * session without that person's code.
 */
const HIDDEN_PATHS = new Set([
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
  "/two-factor/verify-totp",
  "/two-factor/generate-backup-codes",
  "/two-factor/verify-backup-code",
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
]);

const CODE_PATHS = new Set(["/two-factor/send-otp", "/two-factor/verify-otp"]);

const notAllowed = () => APIError.from("FORBIDDEN", ERROR_CODES.NOT_ALLOWED);

/** Marks a pending login's code as sent; another may go once it runs out */
const sentId = (pendingKey: string) => `login-code-sent:${pendingKey}`;
/** The count of wrong codes in a row, per account */
const failuresId = (userId: string) => `login-code-failures:${userId}`;

// This plugin's own verification rows are read and written with Drizzle so
// that each check and its write happen under one lock: concurrent requests
// would otherwise both pass the cooldown, or both count from the same number.

/** The newest row if it hasn't run out; better-auth deletes expired rows lazily */
async function activeRow(executor: Executor, identifier: string) {
  const [row] = await executor
    .select()
    .from(verificationTable)
    .where(eq(verificationTable.identifier, identifier))
    .orderBy(desc(verificationTable.createdAt))
    .limit(1);
  return row && row.expiresAt > new Date() ? row : null;
}

/** Runs `fn` while holding a lock on `identifier` until the transaction ends */
function withRowLock<T>(
  identifier: string,
  fn: (
    tx: Transaction,
    row: Awaited<ReturnType<typeof activeRow>>,
  ) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${identifier}))`,
    );
    return fn(tx, await activeRow(tx, identifier));
  });
}

/** Replaces every row of `identifier` with one holding this value */
async function writeRow(
  tx: Transaction,
  identifier: string,
  value: string,
  expiresAt: Date,
) {
  await tx
    .delete(verificationTable)
    .where(eq(verificationTable.identifier, identifier));
  await tx
    .insert(verificationTable)
    .values({ id: crypto.randomUUID(), identifier, value, expiresAt });
}

async function isLocked(userId: string) {
  const row = await activeRow(db, failuresId(userId));
  return !!row && Number(row.value) >= MAX_FAILURES;
}

async function recordFailure(userId: string) {
  const identifier = failuresId(userId);
  await withRowLock(identifier, async (tx, row) => {
    // a run-out count starts again
    const count = (row ? Number(row.value) || 0 : 0) + 1;
    const expiresAt = new Date(
      Date.now() + (count >= MAX_FAILURES ? LOCK_MS : FAILURE_WINDOW_MS),
    );
    await writeRow(tx, identifier, String(count), expiresAt);
  });
}

/** Marks the pending login's code as sent; false when one went within the minute */
function claimSend(pendingKey: string, userId: string) {
  const identifier = sentId(pendingKey);
  return withRowLock(identifier, async (tx, row) => {
    if (row) return false;
    await writeRow(
      tx,
      identifier,
      userId,
      new Date(Date.now() + RESEND_COOLDOWN_MS),
    );
    return true;
  });
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
 * - the TOTP, backup code, enable, disable and impersonation endpoints
 *   answer 404;
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
            if (await isLocked(pending.user.id)) {
              throw APIError.from(
                "TOO_MANY_REQUESTS",
                ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED,
              );
            }

            if (ctx.path !== "/two-factor/send-otp") return;
            if (!(await claimSend(pending.key, pending.user.id))) {
              throw APIError.from(
                "TOO_MANY_REQUESTS",
                ERROR_CODES.LOGIN_CODE_RESEND_TOO_SOON,
              );
            }
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
          // where the code went, so the code step can say where to look;
          // the plugin swallows sendOTP's errors, so a code that went
          // nowhere would otherwise answer { status: true }
          matcher: (ctx) => ctx.path === "/two-factor/send-otp",
          handler: createAuthMiddleware(async (ctx) => {
            if (isAPIError(ctx.context.returned)) return;
            const channel = loginCodeChannelOf(ctx);
            if (!channel) {
              throw APIError.from(
                "BAD_GATEWAY",
                ERROR_CODES.LOGIN_CODE_NOT_SENT,
              );
            }
            return ctx.json({
              status: true,
              channel: loginCodeSentTo(channel),
            });
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/two-factor/verify-otp",
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned;
            if (isAPIError(returned)) {
              if (returned.body?.code !== "INVALID_CODE") return;
              // a wrong code leaves the pending login in place
              const pending = await pendingLoginUser(ctx);
              if (pending) await recordFailure(pending.user.id);
              return;
            }
            // logged in: the wrong codes in a row are over
            const userId = ctx.context.newSession?.user.id;
            if (userId) {
              await db
                .delete(verificationTable)
                .where(eq(verificationTable.identifier, failuresId(userId)));
            }
          }),
        },
      ],
    },
    $ERROR_CODES: ERROR_CODES,
  }) satisfies BetterAuthPlugin;
