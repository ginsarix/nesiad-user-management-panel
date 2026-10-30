"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleUserRound, KeyRound, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { findActiveNavItem } from "@/lib/nav";

export function AppHeader({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const title = findActiveNavItem(pathname)?.title;

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-card px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-center"
      />
      <h1 className="text-base font-medium">{title}</h1>

      <UserMenu user={user} />
    </header>
  );
}

function UserMenu({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [changingPassword, setChangingPassword] = useState(false);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="ml-auto flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
          <span>{user.name}</span>
          <CircleUserRound className="size-6 text-sidebar" />
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="font-medium text-foreground">{user.name}</div>
              <div className="text-xs font-normal">{user.email}</div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setChangingPassword(true)}>
            <KeyRound />
            Şifre değiştir
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut />
            Çıkış yap
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangePasswordDialog
        open={changingPassword}
        onOpenChange={setChangingPassword}
      />
    </>
  );
}
