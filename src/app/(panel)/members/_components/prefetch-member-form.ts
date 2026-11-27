import type { QueryClient } from "@tanstack/react-query";
import type { ClientRequestOptions } from "hono/client";
import { getCompanies } from "@/lib/fetches/company";
import { getOrganizationGroups } from "@/lib/fetches/organization";
import { getParameters } from "@/lib/fetches/parameter";
import { getSectors } from "@/lib/fetches/sector";
import { ORGANIZATIONS } from "@/lib/organizations";

/**
 * What the member form's pickers list: companies, sectors, every
 * Organizasyon page's groups and the Dernek Görevleri
 */
export function prefetchMemberFormOptions(
  queryClient: QueryClient,
  options: ClientRequestOptions,
) {
  return Promise.all([
    queryClient
      .query({
        queryKey: ["companies"],
        queryFn: () => getCompanies(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["sectors"],
        queryFn: () => getSectors(options),
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
