import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getCashAccounts } from "@/lib/fetches/cash-account";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { CashAccounts } from "./cash-accounts";

export default async function CashAccountsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("cash-accounts");

  // prefetch
  await queryClient
    .query({
      queryKey: ["cash-accounts"],
      queryFn: () => getCashAccounts(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CashAccounts savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
