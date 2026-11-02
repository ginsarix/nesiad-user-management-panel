import type { QueryClient } from "@tanstack/react-query";
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

/** Who gets an automatic SMS on `date` (yyyy-MM-dd) */
export async function getSmsCelebrations(
  date: string,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api.sms.celebrations.$get(
    { query: { date } },
    options,
  );

  if (!res.ok) return throwResponseError(res, "Kutlamalar yüklenemedi");

  return await res.json();
}

export async function sendSms(values: SmsSendValues) {
  const res = await rpcClient.api.sms.send.$post({ json: values });

  if (!res.ok) return throwResponseError(res, "SMS gönderilemedi");

  return await res.json();
}

export type SmsSendResponse = Awaited<ReturnType<typeof sendSms>>;

/** The SMS tabs list members and yetkililer; refresh them after changes to either */
export function invalidateSmsQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["sms-contacts"] }),
    queryClient.invalidateQueries({ queryKey: ["sms-celebrations"] }),
  ]);
}
