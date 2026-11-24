import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getMembers } from "@/lib/fetches/member";
import { getOrganizationGroups } from "@/lib/fetches/organization";
import { getParameters } from "@/lib/fetches/parameter";
import { ORGANIZATIONS } from "@/lib/organizations";

/**
 * What the yetkili form's pickers list: members to link, every
 * Organizasyon page's groups and the Dernek Görevleri
 */
export function prefetchRepresentativeFormOptions(
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
    ...ORGANIZATIONS.map((organization) =>
      queryClient
        .query({
          queryKey: ["organizations", organization],
          queryFn: () => getOrganizationGroups(organization, options),
        })
        .catch(console.error),
    ),
    queryClient
      .query({
        queryKey: ["parameters"],
        queryFn: () => getParameters(options),
      })
      .catch(console.error),
  ]);
}
