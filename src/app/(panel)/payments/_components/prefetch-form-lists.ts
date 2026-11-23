import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getCashAccounts } from "@/lib/fetches/cash-account";
import { getCounterparties } from "@/lib/fetches/counterparty";
import { getParameters } from "@/lib/fetches/parameter";

/** The cariler, parameters and Kasa - Banka accounts the payment form and filters pick from */
export function prefetchFormLists(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return Promise.all([
    queryClient
      .query({
        queryKey: ["cash-accounts"],
        queryFn: () => getCashAccounts(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["counterparties"],
        queryFn: () => getCounterparties(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["parameters"],
        queryFn: () => getParameters(options),
      })
      .catch(console.error),
  ]);
}

/** Positive integer id from `?counterparty=12` / `?cashAccount=3`, else undefined */
export function idParam(value: string | string[] | undefined) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
