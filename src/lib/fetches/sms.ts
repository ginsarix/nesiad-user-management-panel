import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";
import type { SmsSendValues } from "../zod-schemas/sms";
import { throwResponseError } from "./errors";

/** Active members, then active yetkililer, each sorted by name */
export async function getSmsContacts(options?: ClientRequestOptions) {
  const res = await rpcClient.api.sms.contacts.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting SMS contacts");

  return await res.json();
}

export async function sendSms(values: SmsSendValues) {
  const res = await rpcClient.api.sms.send.$post({ json: values });

  if (!res.ok) return throwResponseError(res, "SMS gönderilemedi");

  return await res.json();
}

export type SmsSendResponse = Awaited<ReturnType<typeof sendSms>>;
