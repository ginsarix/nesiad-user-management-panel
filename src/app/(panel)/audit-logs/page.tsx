import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { parseAuditFilters } from "@/lib/audit-filters";
import { getAuditLogs } from "@/lib/fetches/audit-log";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { AuditLogs } from "./audit-logs";

export default async function AuditLogsPage({
  searchParams,
}: PageProps<"/audit-logs">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("audit-logs");

  // the same filters the client starts from, so the prefetch is used
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const filters = parseAuditFilters(params);

  // prefetch
  await queryClient
    .query({
      queryKey: ["audit-logs", filters],
      queryFn: () => getAuditLogs(filters, options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AuditLogs savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
