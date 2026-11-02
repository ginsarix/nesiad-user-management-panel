import { env } from "@/lib/env";

// NetGSM REST v2: https://www.netgsm.com.tr/dokuman/#api-dokumani

export type NetgsmMessage = { no: string; msg: string };

/** The HTTP status and the body (parsed JSON, else text), as NetGSM sent them */
export type NetgsmRawResponse = { status: number; body: unknown };

export type SendResult =
  | { ok: true; jobId: string }
  | { ok: false; code: string; message: string };

export type NetgsmClient = {
  /** True when nothing reaches NetGSM (no SMS, no credit spent) */
  dryRun: boolean;
  /** Throws only when NetGSM can't be reached or doesn't answer in time */
  send(messages: NetgsmMessage[]): Promise<NetgsmRawResponse>;
};

/** Answers like NetGSM's success response; used in dry-run mode and tests */
export const fakeNetgsmClient: NetgsmClient = {
  dryRun: true,
  async send() {
    return {
      status: 200,
      body: { code: "00", jobid: `FAKE-${Date.now()}`, description: "queued" },
    };
  },
};

const SEND_URL = "https://api.netgsm.com.tr/sms/rest/v2/send";

export const realNetgsmClient: NetgsmClient = {
  dryRun: false,
  async send(messages) {
    const credentials = Buffer.from(
      `${env.NETGSM_USERNAME}:${env.NETGSM_PASSWORD}`,
    ).toString("base64");

    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgheader: env.NETGSM_HEADER,
        messages,
        encoding: "TR",
        // informational, not commercial: no İYS check
        iysfilter: "0",
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // kept as text; decodeSendResponse reports it as unexpected
    }
    return { status: res.status, body };
  },
};

/** The fake client unless SMS_DRY_RUN=false */
export function netgsmClient(): NetgsmClient {
  return env.SMS_DRY_RUN ? fakeNetgsmClient : realNetgsmClient;
}

/** NetGSM's send error codes, in Turkish for the panel */
export const SEND_ERROR_MESSAGES: Record<string, string> = {
  "20": "Mesaj metninde sorun var ya da karakter sınırı aşıldı",
  "30": "NetGSM kullanıcı adı veya şifresi geçersiz, API erişim izni yok ya da bu sunucunun IP adresine izin verilmemiş",
  "40": "Mesaj başlığı (gönderici adı) NetGSM'de tanımlı değil",
  "50": "Bu NetGSM hesabıyla İYS kontrollü gönderim yapılamıyor",
  "51": "NetGSM aboneliğinde İYS marka bilgisi bulunamadı",
  "70": "NetGSM isteğinde hatalı veya eksik parametre var",
  "80": "NetGSM gönderim sınırı aşıldı",
  "85": "Aynı numaraya 1 dakika içinde 20'den fazla gönderim yapılamaz",
};

/**
 * NetGSM's answer to a send, as a success with its job id or an error with
 * its code and a Turkish message.
 */
export function decodeSendResponse(raw: NetgsmRawResponse): SendResult {
  const body =
    typeof raw.body === "object" && raw.body !== null
      ? (raw.body as Record<string, unknown>)
      : {};
  const code = body.code == null ? null : String(body.code);
  const jobId = body.jobid == null ? "" : String(body.jobid);

  if (raw.status === 200 && code === "00" && jobId) {
    return { ok: true, jobId };
  }
  if (code && code in SEND_ERROR_MESSAGES) {
    return { ok: false, code, message: SEND_ERROR_MESSAGES[code] };
  }
  return {
    ok: false,
    code: code ?? `HTTP ${raw.status}`,
    message: "NetGSM beklenmeyen bir yanıt verdi",
  };
}
