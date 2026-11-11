import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { organizationFromSlug } from "@/lib/organizations";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { GroupForm } from "../../_components/group-form";
import { prefetchGroupFormOptions } from "../../_components/prefetch-group-form";

export default async function NewOrganizationGroupPage({
  params,
}: PageProps<"/organization/[organization]/new">) {
  await requireSession();
  const organization = organizationFromSlug((await params).organization);
  if (!organization) notFound();

  const queryClient = getQueryClient();
  // prefetch (the yetkililer and görevler to pick)
  await prefetchGroupFormOptions(queryClient, await forwardedRequestOptions());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GroupForm organization={organization} />
    </HydrationBoundary>
  );
}
