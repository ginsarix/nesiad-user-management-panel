import type { LoginCodeChannel } from "../login-code";

/**
 * How each login code went out, noted by sendOTP (auth.ts) for the
 * send-otp response (two-factor-guard.ts) and its audit entry (audit.ts).
 * Keyed by the request's ctx.context, the same object in sendOTP and the
 * after hooks; nothing is noted when delivery failed entirely.
 */
const codeChannels = new WeakMap<object, LoginCodeChannel>();

export function rememberLoginCodeChannel(
  ctx: { context: object },
  channel: LoginCodeChannel,
): void {
  codeChannels.set(ctx.context, channel);
}

/** How this request's login code went out, if it did */
export function loginCodeChannelOf(ctx: {
  context: object;
}): LoginCodeChannel | undefined {
  return codeChannels.get(ctx.context);
}
