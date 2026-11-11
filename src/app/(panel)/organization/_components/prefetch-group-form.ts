import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getParameters } from "@/lib/fetches/parameter";
import { getRepresentatives } from "@/lib/fetches/representative";

/** What the group form's pickers list: yetkililer and Dernek Görevleri */
export function prefetchGroupFormOptions(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return Promise.all([
    queryClient
      .query({
        queryKey: ["representatives"],
        queryFn: () => getRepresentatives(options),
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
