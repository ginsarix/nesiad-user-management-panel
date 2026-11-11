import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getOrganizationGroup } from "@/lib/fetches/organization";
import { organizationFromSlug } from "@/lib/organizations";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { GroupDetails } from "./group-details";

export default async function OrganizationGroupPage({
  params,
}: PageProps<"/organization/[organization]/[id]">) {
  await requireSession();
  const { organization: slug, id: rawId } = await params;
  const organization = organizationFromSlug(slug);
  const id = Number(rawId);
  if (!organization || !Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  const group = await queryClient
    .query({
      queryKey: ["organizations", organization, id],
      queryFn: () => getOrganizationGroup(organization, id, options),
    })
    .catch(console.error);

  if (group === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GroupDetails organization={organization} id={id} />
    </HydrationBoundary>
  );
}
