import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { todayInIstanbul } from "@/lib/dates";
import {
  getNoticeSettings,
  getSmsCelebrations,
  getSmsContacts,
  getSmsSettings,
} from "@/lib/fetches/sms";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Sms } from "./sms";

export default async function SmsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch; the Otomatik tab starts on today
  const today = todayInIstanbul();
  await Promise.all([
    queryClient
      .query({
        queryKey: ["sms-contacts"],
        queryFn: () => getSmsContacts(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["sms-settings"],
        queryFn: () => getSmsSettings(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["notice-settings"],
        queryFn: () => getNoticeSettings(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["sms-celebrations", today],
        queryFn: () => getSmsCelebrations(today, options),
      })
      .catch(console.error),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Sms />
    </HydrationBoundary>
  );
}
