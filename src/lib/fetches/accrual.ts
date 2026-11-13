import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";
import type { AmountRowInput } from "../zod-schemas/amount-rows";
import { throwResponseError } from "./errors";

/** The Tahakkuk list in order, and the version a save must start from */
export async function getAccruals(options?: ClientRequestOptions) {
  const res = await rpcClient.api.accruals.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting accruals");

  return await res.json();
}

/**
 * Replaces the list; resolves to its new version. Throws an ApiError whose
 * `field` names a row's input, or a conflict when someone saved first.
 */
export async function saveAccruals(rows: AmountRowInput[], version: string) {
  const res = await rpcClient.api.accruals.$put({ json: { rows, version } });

  if (!res.ok) await throwResponseError(res, "Tahakkuk kaydedilemedi");

  return ((await res.json()) as { version: string }).version;
}

export type Accruals = Awaited<ReturnType<typeof getAccruals>>;
