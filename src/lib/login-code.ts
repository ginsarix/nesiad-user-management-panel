import { sendEmail } from "@/lib/mail";
import { decodeSendResponse, netgsmClient } from "@/lib/sms/netgsm";

export type LoginCodeChannel = "sms" | "email" | "email_fallback";

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
async function trySms(phone: string | null, code: string) {
  if (!phone) return "no phone number";
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
  const problem = await trySms(user.phone, code);
  if (problem === null) return "sms";
  // A missing number and dry run are expected setups, not failures
  if (user.phone && !problem.startsWith("SMS dry run")) {
    console.error(`Login code SMS failed, sending by email: ${problem}`);
  }
  await sendByEmail(user, code);
  return "email_fallback";
}
