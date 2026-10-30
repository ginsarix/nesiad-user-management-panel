"use client";

import { CircleUserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findActiveNavItem } from "@/lib/nav";

export function AppHeader() {
  const pathname = usePathname();
  const title = findActiveNavItem(pathname)?.title;

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-card px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
      <h1 className="text-base font-medium">{title}</h1>

      {/* TODO: replace with the logged-in panel user once auth is in place */}
      <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        <span>Panel Kullanıcısı</span>
        <CircleUserRound className="size-6 text-sidebar" />
      </div>
    </header>
  );
}
