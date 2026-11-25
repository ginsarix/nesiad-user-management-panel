"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  footerLinks,
  isNavItemActive,
  isNavParent,
  isNavParentActive,
  type NavLink,
  type NavParent,
  navGroups,
} from "@/lib/nav";
import { RELEASE_VERSIONS, shortReleaseVersion } from "@/lib/release-notes";

// the gold bar on the left that marks the open page
const ACTIVE_BAR = "data-active:shadow-[inset_3px_0_0_var(--sidebar-primary)]";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 pt-4 pb-5 group-data-[collapsible=icon]:px-2">
        <Link
          href="/"
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
                {group.items.map((item) =>
                  isNavParent(item) ? (
                    <NavParentItem
                      key={item.title}
                      item={item}
                      pathname={pathname}
                    />
                  ) : (
                    <NavLinkItem
                      key={item.href}
                      item={item}
                      pathname={pathname}
                    />
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <ReleaseNotesFooter pathname={pathname} />

      <SidebarRail />
    </Sidebar>
  );
}

function NavLinkItem({ item, pathname }: { item: NavLink; pathname: string }) {
  return (
    <SidebarMenuItem>
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
          className={ACTIVE_BAR}
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  );
}

/**
 * An item that opens to show its pages, e.g. Finans → Ödemeler, Cariler.
 * It starts open on one of its pages. In the collapsed (icons only)
 * sidebar it links to its first page instead.
 */
function NavParentItem({
  item,
  pathname,
}: {
  item: NavParent;
  pathname: string;
}) {
  const { state, isMobile } = useSidebar();
  const active = isNavParentActive(item, pathname);
  const [open, setOpen] = useState(active);

  // opening one of its pages from elsewhere (a link, the URL) opens it
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          render={<Link href={item.children[0].href} />}
          isActive={active}
          tooltip={item.title}
          className={ACTIVE_BAR}
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-expanded={open}
        onClick={() => setOpen((open) => !open)}
      >
        <item.icon />
        <span>{item.title}</span>
        <ChevronRight
          className={`ml-auto transition-transform ${open ? "rotate-90" : ""}`}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {item.children.map((child) => (
            <SidebarMenuSubItem key={child.href}>
              <SidebarMenuSubButton
                render={<Link href={child.href} />}
                isActive={isNavItemActive(child, pathname)}
                className={ACTIVE_BAR}
              >
                <child.icon />
                <span>{child.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

/**
 * The current version and a link to Sürüm Notları, pinned to the bottom of
 * the bar (the nav scrolls above it). Collapsed, it's a single icon.
 */
function ReleaseNotesFooter({ pathname }: { pathname: string }) {
  const [link] = footerLinks;
  const version = shortReleaseVersion(RELEASE_VERSIONS[0]);
  const active = isNavItemActive(link, pathname);

  return (
    <SidebarFooter className="border-t border-sidebar-border px-4 py-3 group-data-[collapsible=icon]:p-2">
      <div className="group-data-[collapsible=icon]:hidden">
        <div className="text-[11px] text-sidebar-foreground/60">
          Sürüm {version}
        </div>
        <Link
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={`mt-0.5 inline-block text-xs underline underline-offset-3 hover:text-white ${
            active ? "text-sidebar-primary" : "text-white"
          }`}
        >
          {link.title} →
        </Link>
      </div>
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link href={link.href} />}
            isActive={active}
            tooltip={`${link.title} · ${version}`}
            className={ACTIVE_BAR}
          >
            <link.icon />
            <span>{link.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
