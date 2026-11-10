import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/fetches/project";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { EditProject } from "./edit-project";

export default async function EditProjectPage({
  params,
}: PageProps<"/projects/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  const project = await queryClient
    .query({
      queryKey: ["projects", id],
      queryFn: () => getProject(id, options),
    })
    .catch(console.error);

  if (project === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditProject id={id} />
    </HydrationBoundary>
  );
}
