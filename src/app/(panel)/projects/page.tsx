import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getProjects } from "@/lib/fetches/project";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Projects } from "./projects";

export default async function ProjectsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("projects");

  // prefetch
  await queryClient
    .query({
      queryKey: ["projects"],
      queryFn: () => getProjects(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Projects savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
