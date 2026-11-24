import {
  Award,
  BookUser,
  Briefcase,
  Building2,
  ClipboardCheck,
  Coins,
  FolderKanban,
  HandCoins,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  MessageSquareText,
  Network,
  Newspaper,
  ReceiptText,
  Scale,
  ScrollText,
  Settings,
  UserCheck,
  UserCog,
  UsersRound,
  Vault,
  Wallet,
} from "lucide-react";
import {
  ORGANIZATION_INFO,
  ORGANIZATIONS,
  type Organization,
  organizationHref,
} from "./organizations";

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

const ORGANIZATION_ICONS: Record<Organization, LucideIcon> = {
  management_board: Briefcase,
  committee: UsersRound,
  disciplinary_board: Scale,
  supervisory_board: ClipboardCheck,
  honorary_board: Award,
};

export const navGroups: NavGroup[] = [
  {
    items: [
      { title: "Genel Bakış", href: "/", icon: LayoutDashboard },
      { title: "Üyeler", href: "/members", icon: Building2 },
      {
        title: "Yetkililer",
        href: "/representatives",
        icon: UserCheck,
      },
      {
        title: "Organizasyon",
        icon: Network,
        children: ORGANIZATIONS.map((organization) => ({
          title: ORGANIZATION_INFO[organization].title,
          href: organizationHref(organization),
          icon: ORGANIZATION_ICONS[organization],
        })),
      },
      { title: "SMS", href: "/sms", icon: MessageSquareText },
      {
        title: "Finans",
        icon: Landmark,
        children: [
          { title: "Kasa - Banka", href: "/cash-accounts", icon: Vault },
          { title: "Ödemeler", href: "/payments", icon: HandCoins },
          { title: "Cariler", href: "/counterparties", icon: BookUser },
          { title: "Tahsilatlar", href: "/collections", icon: Coins },
          { title: "Projeler", href: "/projects", icon: FolderKanban },
          { title: "Tahakkuk", href: "/accruals", icon: ReceiptText },
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

/** Links pinned to the bottom of the sidebar, outside the groups */
export const footerLinks: NavLink[] = [
  { title: "Sürüm Notları", href: "/release-notes", icon: Newspaper },
];

export function isNavItemActive(item: NavLink, pathname: string) {
  // "/" is only the dashboard, not every page under it
  if (item.href === "/") return pathname === "/";
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
    .concat(footerLinks)
    .find((item) => isNavItemActive(item, pathname));
}
