import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getOrganizationGroup } from "@/lib/fetches/organization";
import { organizationFromSlug } from "@/lib/organizations";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchGroupFormOptions } from "../../../_components/prefetch-group-form";
import { EditGroup } from "./edit-group";

export default async function EditOrganizationGroupPage({
  params,
}: PageProps<"/organization/[organization]/[id]/edit">) {
  await requireSession();
  const { organization: slug, id: rawId } = await params;
  const organization = organizationFromSlug(slug);
  const id = Number(rawId);
  if (!organization || !Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch the group and what its pickers list
  const [group] = await Promise.all([
    queryClient
      .query({
        queryKey: ["organizations", organization, id],
        queryFn: () => getOrganizationGroup(organization, id, options),
      })
      .catch(console.error),
    prefetchGroupFormOptions(queryClient, options),
  ]);

  if (group === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditGroup organization={organization} id={id} />
    </HydrationBoundary>
  );
}
