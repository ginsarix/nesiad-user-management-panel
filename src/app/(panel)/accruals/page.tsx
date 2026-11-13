import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getAccruals } from "@/lib/fetches/accrual";
import { getRepresentatives } from "@/lib/fetches/representative";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Accruals } from "./accruals";

export default async function AccrualsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch the list and the yetkililer its rows pick from
  await Promise.all([
    queryClient
      .query({ queryKey: ["accruals"], queryFn: () => getAccruals(options) })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["representatives"],
        queryFn: () => getRepresentatives(options),
      })
      .catch(console.error),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Accruals />
    </HydrationBoundary>
  );
}
