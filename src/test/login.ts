// Logging in from tests: the password step, then the emailed code.
// Callers must vi.mock("@/lib/mail") (the code is read from its calls) and
// call cleanUpLogins(createdUserIds) in afterAll.
// Every user has a phone, but tests run in SMS dry run (vitest.config.ts
// sets SMS_DRY_RUN=true over the local .env), so a code asked for without
// ?channel=email still falls back to email. A test that mocks
// "@/lib/sms/netgsm" with a non-dry-run client gets that code by SMS and
// reads it from its own mock; completeLogin always asks by email.
import { inArray } from "drizzle-orm";
import { vi } from "vitest";
import { db } from "@/db";
import { verificationTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";

/** The pending logins started by this test file, as their verification identifiers */
const pendingKeys = new Set<string>();

/** The cookies a browser would send back after this response */
export function cookieHeaders(res: Response) {
  // like a browser: a later cookie of the same name wins, an empty one is removed
  const cookies = new Map<string, string>();
  for (const setCookie of res.headers.getSetCookie()) {
    const pair = setCookie.split(";")[0];
    const name = pair.slice(0, pair.indexOf("="));
    if (pair.length > name.length + 1) cookies.set(name, pair);
    else cookies.delete(name);
  }
  return new Headers({ cookie: [...cookies.values()].join("; ") });
}

/** The verification identifier in a signed `two_factor` cookie value */
function keyOf(cookies: string[]) {
  const value = cookies
    .map((c) => c.split(";")[0].match(/better-auth\.two_factor=(.+)$/)?.[1])
    .findLast(Boolean);
  // the signed value is "<identifier>.<signature>"
  return value ? decodeURIComponent(value).split(".")[0] : null;
}

/** Keeps a sign-in response's pending login for cleanUpLogins() */
export function rememberPendingLogin(res: Response) {
  const key = keyOf(res.headers.getSetCookie());
  if (key) pendingKeys.add(key);
}

/** The pending login's key in startLogin's headers; its code is the verification row `2fa-otp-<key>` */
export function pendingLoginKey(headers: Headers) {
  const key = keyOf((headers.get("cookie") ?? "").split("; "));
  if (!key) throw new Error("No pending login cookie in these headers");
  return key;
}

/** The password step; returns cookie headers carrying the pending `two_factor` cookie */
export async function startLogin(email: string, password: string) {
  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  if (!res.ok) throw new Error(`Sign-in failed with ${res.status}`);
  rememberPendingLogin(res);
  // a logged-in answer here would mean the code step is no longer enforced
  const body = await res.clone().json();
  if (body?.twoFactorRedirect !== true) {
    throw new Error("Sign-in did not ask for a login code (twoFactorRedirect)");
  }
  return cookieHeaders(res);
}

/** The newest login code in the mocked sendEmail calls */
export function lastEmailedCode() {
  const code = vi
    .mocked(sendEmail)
    .mock.calls.map(([mail]) => mail.text.match(/giriş kodunuz: (\d{6})/)?.[1])
    .findLast(Boolean);
  if (!code) throw new Error("No login code was emailed");
  return code;
}

/**
 * The whole login; returns session cookie headers. Asks for the code by email
 * ("E-postayla gönder"), so it works with any NetGSM mock
 */
export async function completeLogin(email: string, password: string) {
  const headers = await startLogin(email, password);
  await auth.api.sendTwoFactorOTP({ headers, query: { channel: "email" } });
  const res = await auth.api.verifyTwoFactorOTP({
    body: { code: lastEmailedCode() },
    headers,
    asResponse: true,
  });
  if (!res.ok) throw new Error(`Code verification failed with ${res.status}`);
  return cookieHeaders(res);
}

/**
 * Deletes what the pending logins left in the verification table, and the
 * wrong-code counts of the given users
 */
export async function cleanUpLogins(userIds: string[] = []) {
  const keys = [...pendingKeys];
  pendingKeys.clear();
  const identifiers = [
    ...keys,
    ...keys.map((key) => `2fa-attempts-${key}`),
    ...keys.map((key) => `2fa-otp-${key}`),
    ...keys.map((key) => `login-code-sent:${key}`),
    ...userIds.map((id) => `login-code-failures:${id}`),
  ];
  if (!identifiers.length) return;
  await db
    .delete(verificationTable)
    .where(inArray(verificationTable.identifier, identifiers));
}
