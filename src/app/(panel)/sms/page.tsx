import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSmsContacts } from "@/lib/fetches/sms";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Sms } from "./sms";

export default async function SmsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  await queryClient
    .query({
      queryKey: ["sms-contacts"],
      queryFn: () => getSmsContacts(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Sms />
    </HydrationBoundary>
  );
}
