"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { isNavItemActive, navGroups } from "@/lib/nav";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 pt-4 pb-5 group-data-[collapsible=icon]:px-2">
        <Link
          href="/members"
          // When collapsed, crop the logo down to its gear emblem
          className="block overflow-hidden group-data-[collapsible=icon]:w-8"
        >
          <Image
            src="/nesiad-logo-white.png"
            alt="NESİAD"
            width={150}
            height={53}
            preload
            className="max-w-none group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-auto"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label ?? "main"}>
            {group.label && (
              <SidebarGroupLabel className="text-[11px] tracking-wider uppercase text-sidebar-foreground/60">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    {item.comingSoon ? (
                      <>
                        <SidebarMenuButton disabled>
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge className="border border-sidebar-foreground/30 text-[10px] font-normal text-sidebar-foreground/70">
                          yakında
                        </SidebarMenuBadge>
                      </>
                    ) : (
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isNavItemActive(item, pathname)}
                        tooltip={item.title}
                        className="data-active:shadow-[inset_3px_0_0_var(--sidebar-primary)]"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
