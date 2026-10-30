import { cookies } from "next/headers";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Restore the collapsed/expanded state saved by SidebarProvider
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex-1 p-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
