import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getMembers } from "@/lib/fetches/member";
import { getParameters } from "@/lib/fetches/parameter";

/** What the group form's pickers list: üyeler and Dernek Görevleri */
export function prefetchGroupFormOptions(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return Promise.all([
    queryClient
      .query({
        queryKey: ["members"],
        queryFn: () => getMembers(options),
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
