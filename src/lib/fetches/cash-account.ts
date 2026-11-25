import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";
import type {
  CarryOverValues,
  CashAccountCreateValues,
  CashAccountUpdateValues,
} from "../zod-schemas/cash-account";
import { throwResponseError } from "./errors";

/**
 * Sorted by name, each with its current Bakiye (null when no period has
 * started), its periods' Bakiye and how many records use it
 */
export async function getCashAccounts(options?: ClientRequestOptions) {
  const res = await rpcClient.api["cash-accounts"].$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting cash accounts");

  return await res.json();
}

/** Resolves to null when the account does not exist */
export async function getCashAccount(
  id: number,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api["cash-accounts"][":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting a cash account");

  return await res.json();
}

/** Throws an ApiError whose `field` names the input it is about */
export async function createCashAccount(values: CashAccountCreateValues) {
  const res = await rpcClient.api["cash-accounts"].$post({ json: values });

  if (!res.ok) await throwResponseError(res, "Kasa - Banka kaydedilemedi");

  return ((await res.json()) as { id: number }).id;
}

export async function updateCashAccount(
  id: number,
  values: CashAccountUpdateValues,
) {
  const res = await rpcClient.api["cash-accounts"][":id"].$patch({
    param: { id: String(id) },
    json: values,
  });

  if (!res.ok) await throwResponseError(res, "Kasa - Banka güncellenemedi");
}

export async function deleteCashAccount(id: number) {
  const res = await rpcClient.api["cash-accounts"][":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Kasa - Banka silinemedi");
}

export type CashAccountListItem = Awaited<
  ReturnType<typeof getCashAccounts>
>[number];
export type CashAccount = NonNullable<
  Awaited<ReturnType<typeof getCashAccount>>
>;
