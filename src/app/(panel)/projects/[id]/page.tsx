import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { NO_COLLECTION_FILTERS } from "@/lib/collection-filters";
import { getCollections } from "@/lib/fetches/collection";
import { getProject } from "@/lib/fetches/project";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchRepresentatives } from "../_components/prefetch-representatives";
import { ProjectDetails } from "./project-details";

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[id]">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const filters = { ...NO_COLLECTION_FILTERS, project: id };

  // prefetch the proje, its tahsilatlar and the yetkililer of its taahhütler
  const [project] = await Promise.all([
    queryClient
      .query({
        queryKey: ["projects", id],
        queryFn: () => getProject(id, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["collections", "list", filters],
        queryFn: () => getCollections(filters, options),
      })
      .catch(console.error),
    prefetchRepresentatives(queryClient, options),
  ]);

  if (project === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectDetails id={id} />
    </HydrationBoundary>
  );
}
