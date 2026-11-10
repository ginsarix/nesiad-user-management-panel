import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getCounterparty } from "@/lib/fetches/counterparty";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { EditCounterparty } from "./edit-counterparty";

export default async function EditCounterpartyPage({
  params,
}: PageProps<"/counterparties/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  const counterparty = await queryClient
    .query({
      queryKey: ["counterparties", id],
      queryFn: () => getCounterparty(id, options),
    })
    .catch(console.error);

  if (counterparty === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditCounterparty id={id} />
    </HydrationBoundary>
  );
}
