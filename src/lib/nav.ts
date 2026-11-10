import {
  BookUser,
  Building2,
  Coins,
  FolderKanban,
  HandCoins,
  Landmark,
  type LucideIcon,
  MessageSquareText,
  ScrollText,
  Settings,
  UserCheck,
  UserCog,
  Wallet,
} from "lucide-react";

/** A page in the sidebar */
export type NavLink = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the sidebar as "yakında" without a link or page */
  comingSoon?: boolean;
};

/** A sidebar item that opens to show its pages (e.g. Finans) */
export type NavParent = {
  title: string;
  icon: LucideIcon;
  children: NavLink[];
};

export type NavItem = NavLink | NavParent;

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export function isNavParent(item: NavItem): item is NavParent {
  return "children" in item;
}

export const navGroups: NavGroup[] = [
  {
    items: [
      { title: "Üyeler", href: "/members", icon: Building2 },
      {
        title: "Yetkililer",
        href: "/representatives",
        icon: UserCheck,
      },
      { title: "SMS", href: "/sms", icon: MessageSquareText },
      {
        title: "Finans",
        icon: Landmark,
        children: [
          { title: "Ödemeler", href: "/payments", icon: HandCoins },
          { title: "Cariler", href: "/counterparties", icon: BookUser },
          { title: "Tahsilatlar", href: "/collections", icon: Coins },
          { title: "Projeler", href: "/projects", icon: FolderKanban },
        ],
      },
      {
        // a separate, undecided feature; not the Tahsilatlar page
        title: "Otomatik Tahsilatlar",
        href: "/automatic-collections",
        icon: Wallet,
        comingSoon: true,
      },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { title: "Panel Kullanıcıları", href: "/panel-users", icon: UserCog },
      { title: "Denetim Kayıtları", href: "/audit-logs", icon: ScrollText },
      { title: "Ayarlar", href: "/settings", icon: Settings },
    ],
  },
];

export function isNavItemActive(item: NavLink, pathname: string) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Whether one of the parent's pages is open */
export function isNavParentActive(item: NavParent, pathname: string) {
  return item.children.some((child) => isNavItemActive(child, pathname));
}

/** The page the path belongs to, looking inside parents too */
export function findActiveNavItem(pathname: string) {
  return navGroups
    .flatMap((group) => group.items)
    .flatMap((item) => (isNavParent(item) ? item.children : [item]))
    .find((item) => isNavItemActive(item, pathname));
}
