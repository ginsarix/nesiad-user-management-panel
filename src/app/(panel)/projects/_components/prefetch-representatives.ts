import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getRepresentatives } from "@/lib/fetches/representative";

/** The Taahhütler editor's yetkililer, so saved rows render with names */
export function prefetchRepresentatives(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return queryClient
    .query({
      queryKey: ["representatives"],
      queryFn: () => getRepresentatives(options),
    })
    .catch(console.error);
}
