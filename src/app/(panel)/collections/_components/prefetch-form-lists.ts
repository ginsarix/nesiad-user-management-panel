import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getMembers } from "@/lib/fetches/member";
import { getParameters } from "@/lib/fetches/parameter";
import { getProjects } from "@/lib/fetches/project";

/** The members, parameters and projeler the tahsilat form and filters pick from */
export function prefetchFormLists(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return Promise.all([
    queryClient
      .query({ queryKey: ["members"], queryFn: () => getMembers(options) })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["parameters"],
        queryFn: () => getParameters(options),
      })
      .catch(console.error),
    queryClient
      .query({ queryKey: ["projects"], queryFn: () => getProjects(options) })
      .catch(console.error),
  ]);
}

/** Positive integer id from `?member=12` / `?project=3`, else undefined */
export function idParam(value: string | string[] | undefined) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
