// Logging in from tests: the password step, then the emailed code.
// Callers must vi.mock("@/lib/mail") (the code is read from its calls) and
// call cleanUpLogins() in afterAll.
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

/** Keeps a sign-in response's pending login for cleanUpLogins() */
export function rememberPendingLogin(res: Response) {
  const value = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0].match(/better-auth\.two_factor=(.+)$/)?.[1])
    .findLast(Boolean);
  // the signed value is "<identifier>.<signature>"
  if (value) pendingKeys.add(decodeURIComponent(value).split(".")[0]);
}

/** The password step; returns cookie headers carrying the pending `two_factor` cookie */
export async function startLogin(email: string, password: string) {
  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  if (!res.ok) throw new Error(`Sign-in failed with ${res.status}`);
  rememberPendingLogin(res);
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

/** The whole login; returns session cookie headers */
export async function completeLogin(email: string, password: string) {
  const headers = await startLogin(email, password);
  await auth.api.sendTwoFactorOTP({ headers });
  const res = await auth.api.verifyTwoFactorOTP({
    body: { code: lastEmailedCode() },
    headers,
    asResponse: true,
  });
  if (!res.ok) throw new Error(`Code verification failed with ${res.status}`);
  return cookieHeaders(res);
}

/** Deletes what the pending logins left in the verification table */
export async function cleanUpLogins() {
  const keys = [...pendingKeys];
  pendingKeys.clear();
  if (!keys.length) return;
  await db
    .delete(verificationTable)
    .where(
      inArray(verificationTable.identifier, [
        ...keys,
        ...keys.map((key) => `2fa-attempts-${key}`),
        ...keys.map((key) => `2fa-otp-${key}`),
      ]),
    );
}
