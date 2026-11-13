import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/fetches/project";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchRepresentatives } from "../../_components/prefetch-representatives";
import { EditProject } from "./edit-project";

export default async function EditProjectPage({
  params,
}: PageProps<"/projects/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch the proje and the yetkililer of its taahhütler
  const [project] = await Promise.all([
    queryClient
      .query({
        queryKey: ["projects", id],
        queryFn: () => getProject(id, options),
      })
      .catch(console.error),
    prefetchRepresentatives(queryClient, options),
  ]);

  if (project === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditProject id={id} />
    </HydrationBoundary>
  );
}
