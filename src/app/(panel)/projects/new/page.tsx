import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchRepresentatives } from "../_components/prefetch-representatives";
import { ProjectForm } from "../_components/project-form";

export default async function NewProjectPage() {
  await requireSession();
  const queryClient = getQueryClient();
  // prefetch (the yetkililer the Taahhütler rows pick from)
  await prefetchRepresentatives(queryClient, await forwardedRequestOptions());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectForm />
    </HydrationBoundary>
  );
}
