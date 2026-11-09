import { sendEmail } from "@/lib/mail";
import { decodeSendResponse, netgsmClient } from "@/lib/sms/netgsm";

/**
 * How a login code went out: by SMS, by email because it was asked for, by
 * email because SMS failed (or is in dry run), or by email because the
 * account has no number yet
 */
export type LoginCodeChannel =
  | "sms"
  | "email"
  | "email_fallback"
  | "email_no_phone";

/** What the code step tells the person: where to look for the code */
export type LoginCodeSentTo = "sms" | "email";

export function loginCodeSentTo(channel: LoginCodeChannel): LoginCodeSentTo {
  return channel === "sms" ? "sms" : "email";
}

export function loginCodeSms(code: string): string {
  return `Dernek Üye Paneli giriş kodunuz: ${code}. Kod 5 dakika geçerlidir.`;
}

export function phoneCodeSms(code: string): string {
  return `Dernek Üye Paneli telefon doğrulama kodunuz: ${code}. Kod 5 dakika geçerlidir.`;
}

async function sendByEmail(
  user: { name: string; email: string },
  code: string,
) {
  await sendEmail({
    to: user.email,
    subject: "Dernek Üye Paneli Giriş Kodu",
    text: `Merhaba ${user.name}, giriş kodunuz: ${code}. Kod 5 dakika geçerlidir. Bu girişi siz yapmadıysanız şifrenizi değiştirin.`,
  });
}

/** Tries SMS; returns why it can't be used, or null once the SMS is sent. Never includes the code. */
async function trySms(phone: string, code: string) {
  const client = netgsmClient();
  if (client.dryRun) return "SMS dry run";
  try {
    const result = decodeSendResponse(
      await client.send([{ no: phone, msg: loginCodeSms(code) }]),
    );
    return result.ok ? null : `NetGSM error ${result.code}: ${result.message}`;
  } catch (error) {
    return `NetGSM unreachable: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

/** Sends `code`; never throws for SMS problems (falls back to email). Throws only if the email also fails. */
export async function deliverLoginCode(input: {
  user: { name: string; email: string; phone: string | null };
  code: string;
  emailOnly: boolean;
}): Promise<LoginCodeChannel> {
  const { user, code, emailOnly } = input;
  if (emailOnly) {
    await sendByEmail(user, code);
    return "email";
  }
  // until deploy 2 an account may have no number yet; an expected setup
  if (!user.phone) {
    await sendByEmail(user, code);
    return "email_no_phone";
  }
  const problem = await trySms(user.phone, code);
  if (problem === null) return "sms";
  // dry run is an expected setup, not a failure
  if (!problem.startsWith("SMS dry run")) {
    console.error(`Login code SMS failed, sending by email: ${problem}`);
  }
  await sendByEmail(user, code);
  return "email_fallback";
}
