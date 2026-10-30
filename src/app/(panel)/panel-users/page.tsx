import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getPanelUsers } from "@/lib/fetches/panel-user";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedHeaders, requireSession } from "@/lib/session";
import { PanelUsers } from "./panel-users";

export default async function PanelUsersPage() {
  const { user } = await requireSession();
  const headers = await forwardedHeaders();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("panel-users");

  // prefetch
  await queryClient
    .query({
      queryKey: ["panel-users"],
      queryFn: () => getPanelUsers(headers),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PanelUsers
        // from the server so "Siz" and the hidden actions don't flash
        currentUserId={user.id}
        savedColumnVisibility={savedColumnVisibility}
      />
    </HydrationBoundary>
  );
}
