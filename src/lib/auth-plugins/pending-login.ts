import type { createAuthMiddleware } from "better-auth/api";

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * The login waiting for its code: the password step was passed and the
 * browser holds the signed `two_factor` cookie. `key` is that cookie's
 * verification identifier (the row better-auth's twoFactor plugin made, whose
 * value is the user id); null when there is no cookie or it ran out.
 */
export async function pendingLoginUser(ctx: Ctx): Promise<{
  key: string;
  user: { id: string; name: string; email: string };
} | null> {
  const key = await ctx.getSignedCookie(
    ctx.context.createAuthCookie("two_factor").name,
    ctx.context.secret,
  );
  if (!key) return null;

  const pending = await ctx.context.internalAdapter.findVerificationValue(key);
  // better-auth deletes expired rows lazily, so one can still be found
  if (!pending || pending.expiresAt <= new Date()) return null;

  const user = await ctx.context.internalAdapter.findUserById(pending.value);
  if (!user) return null;
  return { key, user: { id: user.id, name: user.name, email: user.email } };
}
