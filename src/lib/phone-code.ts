import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { verificationTable } from "@/db/schema";
import { phoneCodeSms } from "./login-code";
import { decodeSendResponse, netgsmClient } from "./sms/netgsm";
import { maskPhone } from "./sms/phone";

// Codes that prove a panel user's mobile number before it is stored. One
// verification row per (admin session, number): identifier
// `phone-code:{sessionId}:{phone}`, value `{sha256hex(code)}:{attempts}`.
// Read and written with Drizzle under an advisory lock on the identifier, so
// concurrent requests can't both pass the cooldown or count from one number.

const CODE_LIFETIME_MS = 5 * 60 * 1000;
/** One new code a minute per (session, number) */
const RESEND_COOLDOWN_MS = 60 * 1000;
/** Wrong tries a code survives */
const ALLOWED_ATTEMPTS = 5;

export type PhoneCodeCheck = "ok" | "wrong" | "expired" | "too_many";

/** `phone` is the normalized number (`normalizePhone`), so formats match */
const identifierOf = (sessionId: string, phone: string) =>
  `phone-code:${sessionId}:${phone}`;

const hashOf = (code: string) =>
  createHash("sha256").update(code).digest("hex");

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

/** Runs `fn` with the identifier's row while holding a lock on it */
function withRowLock<T>(
  identifier: string,
  fn: (tx: Executor, row: Awaited<ReturnType<typeof activeRow>>) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${identifier}))`,
    );
    return fn(tx, await activeRow(tx, identifier));
  });
}

/**
 * Sends a new 6-digit code to `phone` by SMS, replacing any earlier one.
 * Refused within a minute of the last code; a failed send leaves no code.
 */
export async function issuePhoneCode(
  sessionId: string,
  phone: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: "too_soon" | "sms_failed"; message?: string }
> {
  const identifier = identifierOf(sessionId, phone);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  const rowId = await withRowLock(identifier, async (tx, row) => {
    if (row && row.createdAt.getTime() > Date.now() - RESEND_COOLDOWN_MS) {
      return null;
    }
    const id = crypto.randomUUID();
    await tx
      .delete(verificationTable)
      .where(eq(verificationTable.identifier, identifier));
    await tx.insert(verificationTable).values({
      id,
      identifier,
      value: `${hashOf(code)}:0`,
      // this server's clock, like the cooldown check above, not Postgres's
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
    });
    return id;
  });
  if (!rowId) return { ok: false, reason: "too_soon" };

  const client = netgsmClient();
  if (client.dryRun) {
    // the one place a code may be printed (global constraints)
    console.info("DRY RUN phone code for", maskPhone(phone), code);
    return { ok: true };
  }

  let message: string;
  try {
    const result = decodeSendResponse(
      await client.send([{ no: phone, msg: phoneCodeSms(code) }]),
    );
    if (result.ok) return { ok: true };
    message = result.message;
  } catch (error) {
    // the error is about the request, never its body, so it holds no code
    console.error(
      "Phone code SMS failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    message = "NetGSM'e ulaşılamadı";
  }

  // the code never went out, so it can't block a retry for a minute
  await db.delete(verificationTable).where(eq(verificationTable.id, rowId));
  return { ok: false, reason: "sms_failed", message };
}

/**
 * Checks a code for (session, number). A wrong code uses up one of 5 tries.
 * The right one is consumed, unless `consume: false`: then call
 * `consumePhoneCode` once what the code unlocks has succeeded, so a failure
 * there doesn't cost the person a new code.
 */
export async function checkPhoneCode(
  sessionId: string,
  phone: string,
  code: string,
  { consume = true }: { consume?: boolean } = {},
): Promise<PhoneCodeCheck> {
  const identifier = identifierOf(sessionId, phone);

  return withRowLock(identifier, async (tx, row) => {
    if (!row) return "expired";
    const [hash, attemptsText] = row.value.split(":");
    const attempts = Number(attemptsText) || 0;
    if (attempts >= ALLOWED_ATTEMPTS) return "too_many";

    const given = Buffer.from(hashOf(code));
    const expected = Buffer.from(hash ?? "");
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      if (consume) await consumePhoneCode(sessionId, phone, tx);
      return "ok";
    }

    await tx
      .update(verificationTable)
      .set({ value: `${hash}:${attempts + 1}` })
      .where(eq(verificationTable.id, row.id));
    return "wrong";
  });
}

/** Deletes the code for (session, number); pass a transaction to tie it to a change */
export async function consumePhoneCode(
  sessionId: string,
  phone: string,
  executor: Executor = db,
) {
  await executor
    .delete(verificationTable)
    .where(eq(verificationTable.identifier, identifierOf(sessionId, phone)));
}

/** What the panel says for a code that wasn't accepted */
export const PHONE_CODE_MESSAGES: Record<
  Exclude<PhoneCodeCheck, "ok">,
  string
> = {
  wrong: "Kod hatalı",
  expired: "Kodun süresi doldu, yeni kod isteyin",
  too_many: "Deneme hakkı doldu, yeni kod isteyin",
};
