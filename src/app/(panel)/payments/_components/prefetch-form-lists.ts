import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getCounterparties } from "@/lib/fetches/counterparty";
import { getParameters } from "@/lib/fetches/parameter";

/** The cariler and parameters the payment form picks from */
export function prefetchFormLists(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return Promise.all([
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

/** Positive integer id from `?counterparty=12`, else undefined */
export function counterpartyParam(value: string | string[] | undefined) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
