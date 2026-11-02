import { env } from "@/lib/env";

// NetGSM REST v2: https://www.netgsm.com.tr/dokuman/#api-dokumani

export type NetgsmMessage = { no: string; msg: string };

/** The HTTP status and the parsed JSON body, as NetGSM sent them */
export type NetgsmRawResponse = { status: number; body: unknown };

export type SendResult =
  | { ok: true; jobId: string }
  | { ok: false; code: string; message: string };

export type NetgsmClient = {
  /** True when nothing reaches NetGSM (no SMS, no credit spent) */
  dryRun: boolean;
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

const realNetgsmClient: NetgsmClient = {
  dryRun: false,
  async send() {
    throw new Error("Kilitli: gerçek gönderim Level 3'te açılıyor");
  },
};

/** The fake client unless SMS_DRY_RUN=false */
export function netgsmClient(): NetgsmClient {
  return env.SMS_DRY_RUN ? fakeNetgsmClient : realNetgsmClient;
}

/**
 * NetGSM's answer to a send, as a success with its job id or an error with
 * its code and a Turkish message.
 *
 * TODO(level 3): decode error codes; for now assumes success and reads `jobid`.
 */
export function decodeSendResponse(raw: NetgsmRawResponse): SendResult {
  const body = raw.body as { jobid: string };
  return { ok: true, jobId: String(body.jobid) };
}
