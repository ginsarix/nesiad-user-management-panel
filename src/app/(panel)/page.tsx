import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getDashboard } from "@/lib/fetches/dashboard";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Dashboard } from "./dashboard";

export default async function DashboardPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  await queryClient
    .query({
      queryKey: ["dashboard"],
      queryFn: () => getDashboard(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Dashboard />
    </HydrationBoundary>
  );
}
