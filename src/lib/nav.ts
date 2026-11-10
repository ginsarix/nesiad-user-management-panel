import {
  BookUser,
  Building2,
  HandCoins,
  type LucideIcon,
  MessageSquareText,
  ScrollText,
  Settings,
  UserCheck,
  UserCog,
  Wallet,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the sidebar as "yakında" without a link or page */
  comingSoon?: boolean;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

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
      { title: "Ödemeler", href: "/payments", icon: HandCoins },
      { title: "Cariler", href: "/counterparties", icon: BookUser },
      {
        title: "Otomatik Tahsilatlar",
        href: "/collections",
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

export function isNavItemActive(item: NavItem, pathname: string) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function findActiveNavItem(pathname: string) {
  return navGroups
    .flatMap((group) => group.items)
    .find((item) => isNavItemActive(item, pathname));
}
