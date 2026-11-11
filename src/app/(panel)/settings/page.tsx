import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getParameters } from "@/lib/fetches/parameter";
import { getSectors } from "@/lib/fetches/sector";
import {
  getCollectionNoticeTemplates,
  getNoticeSettings,
  getSmsContacts,
  getSmsSettings,
} from "@/lib/fetches/sms";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Settings } from "./settings";
import { parseSettingsTab } from "./tabs";

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedSectorColumnVisibility = await getSavedColumnVisibility("sectors");
  const { tab } = await searchParams;

  // prefetch
  await Promise.all([
    queryClient
      .query({
        queryKey: ["sectors"],
        queryFn: () => getSectors(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["parameters"],
        queryFn: () => getParameters(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["sms-settings"],
        queryFn: () => getSmsSettings(options),
      })
      .catch(console.error),
    // the Bildirimler tab warns when dry run is on
    queryClient
      .query({
        queryKey: ["sms-contacts"],
        queryFn: () => getSmsContacts(options),
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
        queryKey: ["collection-notice-settings"],
        queryFn: () => getCollectionNoticeTemplates(options),
      })
      .catch(console.error),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Settings
        initialTab={parseSettingsTab(tab)}
        savedSectorColumnVisibility={savedSectorColumnVisibility}
      />
    </HydrationBoundary>
  );
}
