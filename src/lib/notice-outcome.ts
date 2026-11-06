/** Client-safe copy of `NoticeOutcome` in application-notices.ts, which is server code */
export type NoticeOutcome = "sent" | "failed" | "skipped" | "unknown";

export type NoticeOutcomes = { email: NoticeOutcome; sms: NoticeOutcome };

const EMAIL_WARNINGS: Record<Exclude<NoticeOutcome, "sent">, string> = {
  failed: "E-posta gönderilemedi.",
  skipped: "E-posta gönderilmedi: adres eksik veya geçersiz.",
  unknown: "E-postanın gidip gitmediği bilinmiyor.",
};

const SMS_WARNINGS: Record<Exclude<NoticeOutcome, "sent">, string> = {
  failed: "SMS gönderilemedi.",
  skipped: "SMS gönderilmedi: cep telefonu eksik veya geçersiz.",
  unknown:
    "NetGSM yanıt vermedi, SMS gitmiş olabilir. Tekrar göndermeyin; gerekirse NetGSM kayıtlarından kontrol edin.",
};

/** Text for the staff when a notice didn't go out; null when nothing went wrong */
export function noticeWarning(notices: NoticeOutcomes | null): string | null {
  if (!notices) return null;

  const warnings = [
    notices.email !== "sent" && EMAIL_WARNINGS[notices.email],
    notices.sms !== "sent" && SMS_WARNINGS[notices.sms],
  ].filter((warning): warning is string => !!warning);

  return warnings.length > 0 ? warnings.join(" ") : null;
}
