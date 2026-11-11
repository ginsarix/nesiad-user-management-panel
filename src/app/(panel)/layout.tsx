import { cookies } from "next/headers";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SessionTimeout } from "@/components/session-timeout";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireSession } from "@/lib/session";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pages that load data check the session themselves too, since this
  // layout doesn't re-render on client-side navigation
  const { user } = await requireSession();

  // Restore the collapsed/expanded state saved by SidebarProvider
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <SessionTimeout />
      <AppSidebar />
      <SidebarInset>
        <AppHeader user={{ name: user.name, email: user.email }} />
        <div className="flex-1 p-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
