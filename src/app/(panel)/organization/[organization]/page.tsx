import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getOrganizationGroups } from "@/lib/fetches/organization";
import { organizationFromSlug } from "@/lib/organizations";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { OrganizationGroups } from "./organization-groups";

export default async function OrganizationPage({
  params,
}: PageProps<"/organization/[organization]">) {
  await requireSession();
  const organization = organizationFromSlug((await params).organization);
  if (!organization) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility(
    `organization-${organization}`,
  );

  // prefetch
  await queryClient
    .query({
      queryKey: ["organizations", organization],
      queryFn: () => getOrganizationGroups(organization, options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrganizationGroups
        organization={organization}
        savedColumnVisibility={savedColumnVisibility}
      />
    </HydrationBoundary>
  );
}
