import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getMembers } from "@/lib/fetches/member";

/** The Taahhütler editor's üyeler, so saved rows render with names */
export function prefetchMembers(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return queryClient
    .query({
      queryKey: ["members"],
      queryFn: () => getMembers(options),
    })
    .catch(console.error);
}
