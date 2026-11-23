import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { NO_COLLECTION_FILTERS } from "@/lib/collection-filters";
import { getCashAccount } from "@/lib/fetches/cash-account";
import { getCollections } from "@/lib/fetches/collection";
import { getPayments } from "@/lib/fetches/payment";
import { NO_PAYMENT_FILTERS } from "@/lib/payment-filters";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { CashAccountDetails } from "./cash-account-details";

export default async function CashAccountPage({
  params,
}: PageProps<"/cash-accounts/[id]">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const collectionFilters = { ...NO_COLLECTION_FILTERS, cashAccount: id };
  const paymentFilters = { ...NO_PAYMENT_FILTERS, cashAccount: id };

  // prefetch the account and its tahsilatlar and ödemeler
  const [account] = await Promise.all([
    queryClient
      .query({
        queryKey: ["cash-accounts", id],
        queryFn: () => getCashAccount(id, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["collections", "list", collectionFilters],
        queryFn: () => getCollections(collectionFilters, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["payments", "list", paymentFilters],
        queryFn: () => getPayments(paymentFilters, options),
      })
      .catch(console.error),
  ]);

  if (account === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CashAccountDetails id={id} />
    </HydrationBoundary>
  );
}
