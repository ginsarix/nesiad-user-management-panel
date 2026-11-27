import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getAccruals } from "@/lib/fetches/accrual";
import { getMembers } from "@/lib/fetches/member";
import { getParameters } from "@/lib/fetches/parameter";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Accruals } from "./accruals";

export default async function AccrualsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch the list and what its rows pick from: üyeler, Tahakkuk Türleri
  await Promise.all([
    queryClient
      .query({ queryKey: ["accruals"], queryFn: () => getAccruals(options) })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["members"],
        queryFn: () => getMembers(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["parameters"],
        queryFn: () => getParameters(options),
      })
      .catch(console.error),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Accruals />
    </HydrationBoundary>
  );
}
