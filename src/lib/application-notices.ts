import { z } from "zod";
import { getApplicationNoticeSettings } from "./application-notice-settings";
import { sendEmail } from "./mail";
import { decodeSendResponse, netgsmClient } from "./sms/netgsm";
import { checkPhone } from "./sms/recipients";
import { fillTemplate } from "./sms/templates";
import { SMS_MAX_LENGTH } from "./zod-schemas/sms";

/** `unknown`: NetGSM didn't answer, so the SMS may have gone */
export type NoticeOutcome = "sent" | "failed" | "skipped" | "unknown";

export type NoticeApplicant = {
  title: string;
  applicantFirstName: string | null;
  applicantLastName: string | null;
  email: string | null;
  mobilePhone: string | null;
};

export type NoticeKind = "received" | "accepted" | "rejected";

export type NoticeOutcomes = { email: NoticeOutcome; sms: NoticeOutcome };

/**
 * What may be logged about a failure. Error messages and nodemailer's
 * `rejected`/`response` hold addresses, numbers or message text, so only
 * short codes are kept.
 */
function safeErrorInfo(error: unknown) {
  const { code, responseCode } = (error ?? {}) as Record<string, unknown>;
  const pick = (v: unknown) =>
    typeof v === "string" || typeof v === "number" ? v : undefined;
  return { code: pick(code), responseCode: pick(responseCode) };
}

const EMAIL_TIMEOUT_MS = 30_000;

const emailSchema = z.email();

/** Rejects after `ms`; the sending keeps going but its outcome is ignored */
async function withTimeout(task: Promise<void>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Email timed out")), ms);
  });
  try {
    // if the timeout wins, a later rejection of `task` is still handled here
    await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Sends one notice email; never throws. `label` starts its log line */
export async function sendNoticeEmail(
  label: string,
  to: string | null,
  subject: string,
  text: string,
): Promise<NoticeOutcome> {
  const address = to?.trim();
  if (!address || !emailSchema.safeParse(address).success) return "skipped";
  try {
    await withTimeout(
      sendEmail({ to: address, subject, text }),
      EMAIL_TIMEOUT_MS,
    );
    return "sent";
  } catch (error) {
    console.error(`${label} failed`, safeErrorInfo(error));
    return "failed";
  }
}

/**
 * Sends one notice SMS; never throws. `label` starts its log lines, e.g.
 * "Application notice SMS (accepted)"; they never hold the number or text.
 */
export async function sendNoticeSms(
  label: string,
  mobilePhone: string | null,
  message: string,
): Promise<NoticeOutcome> {
  const phone = checkPhone(mobilePhone);
  if (!phone.ok) return "skipped";
  // a truncated message could say something else, so a long one isn't sent
  if (message.length > SMS_MAX_LENGTH) {
    console.error(
      `${label} not sent: ${message.length} characters, the limit is ${SMS_MAX_LENGTH}`,
    );
    return "failed";
  }

  let raw: Awaited<ReturnType<ReturnType<typeof netgsmClient>["send"]>>;
  try {
    raw = await netgsmClient().send([{ no: phone.phone, msg: message }]);
  } catch (error) {
    console.error(`${label}: NetGSM gave no answer`, safeErrorInfo(error));
    return "unknown";
  }
  const result = decodeSendResponse(raw);
  if (!result.ok) {
    console.error(`${label} refused by NetGSM, code:`, result.code);
    return "failed";
  }
  // the job id finds the message in NetGSM's reports; it holds no number or text
  console.info(`${label} accepted by NetGSM, job:`, result.jobId);
  return "sent";
}

/**
 * Sends the received, accepted or rejected email and SMS from the Ayarlar
 * templates. Never throws: each channel reports its own outcome, and nothing
 * is retried.
 */
export async function sendApplicationNotices(
  kind: NoticeKind,
  applicant: NoticeApplicant,
): Promise<NoticeOutcomes> {
  try {
    const settings = await getApplicationNoticeSettings();
    // staff can blank the names later; "Sayın , …" would read badly
    const ad =
      `${applicant.applicantFirstName ?? ""} ${applicant.applicantLastName ?? ""}`.trim() ||
      applicant.title;
    const values = { ad, firma: applicant.title };

    const smsTemplate = settings[`${kind}Sms`];
    const subjectTemplate = settings[`${kind}EmailSubject`];
    const bodyTemplate = settings[`${kind}EmailBody`];

    const [email, sms] = await Promise.all([
      sendNoticeEmail(
        "Application notice email",
        applicant.email,
        fillTemplate(subjectTemplate, values),
        fillTemplate(bodyTemplate, values),
      ),
      sendNoticeSms(
        `Application notice SMS (${kind})`,
        applicant.mobilePhone,
        fillTemplate(smsTemplate, values),
      ),
    ]);
    return { email, sms };
  } catch (error) {
    console.error("Application notices failed", safeErrorInfo(error));
    return { email: "failed", sms: "failed" };
  }
}
