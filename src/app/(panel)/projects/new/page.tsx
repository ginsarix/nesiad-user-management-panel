import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchMembers } from "../_components/prefetch-members";
import { ProjectForm } from "../_components/project-form";

export default async function NewProjectPage() {
  await requireSession();
  const queryClient = getQueryClient();
  // prefetch (the üyeler the Taahhütler rows pick from)
  await prefetchMembers(queryClient, await forwardedRequestOptions());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectForm />
    </HydrationBoundary>
  );
}
