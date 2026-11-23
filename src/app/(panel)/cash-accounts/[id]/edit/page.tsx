import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getCashAccount } from "@/lib/fetches/cash-account";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { EditCashAccount } from "./edit-cash-account";

export default async function EditCashAccountPage({
  params,
}: PageProps<"/cash-accounts/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  const account = await queryClient
    .query({
      queryKey: ["cash-accounts", id],
      queryFn: () => getCashAccount(id, options),
    })
    .catch(console.error);

  if (account === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditCashAccount id={id} />
    </HydrationBoundary>
  );
}
