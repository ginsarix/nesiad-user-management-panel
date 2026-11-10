import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";
import type { CounterpartyFormValues } from "../zod-schemas/counterparty";
import { throwResponseError } from "./errors";

/** Sorted by Ünvan, each with its payment count and total paid */
export async function getCounterparties(options?: ClientRequestOptions) {
  const res = await rpcClient.api.counterparties.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting cariler");

  return await res.json();
}

/** Resolves to null when the cari does not exist */
export async function getCounterparty(
  id: number,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api.counterparties[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the cari");

  return await res.json();
}

/** Throws an ApiError whose `field` names the input it is about */
export async function createCounterparty(values: CounterpartyFormValues) {
  const res = await rpcClient.api.counterparties.$post({ json: values });

  if (!res.ok) await throwResponseError(res, "Cari kaydedilemedi");

  return ((await res.json()) as { id: number }).id;
}

export async function updateCounterparty(
  id: number,
  values: CounterpartyFormValues,
) {
  const res = await rpcClient.api.counterparties[":id"].$patch({
    param: { id: String(id) },
    json: values,
  });

  if (!res.ok) await throwResponseError(res, "Cari güncellenemedi");
}

export async function deleteCounterparty(id: number) {
  const res = await rpcClient.api.counterparties[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Cari silinemedi");
}

export type CounterpartyListItem = Awaited<
  ReturnType<typeof getCounterparties>
>[number];
export type Counterparty = NonNullable<
  Awaited<ReturnType<typeof getCounterparty>>
>;
