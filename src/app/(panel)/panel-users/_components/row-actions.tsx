"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck,
  CirclePause,
  Ellipsis,
  KeyRound,
  MailCheck,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/ui/field";
import {
  deletePanelUser,
  type PanelUser,
  sendVerificationEmail,
  setPanelUserDisabled,
} from "@/lib/fetches/panel-user";
import { RenameDialog } from "./rename-dialog";
import { SetPasswordDialog } from "./set-password-dialog";

export type Notice = { tone: "success" | "error"; text: string };

/**
 * The "⋯" menu of a row. Your own row only offers renaming: disabling or
 * deleting yourself isn't allowed, and a password set here would log you
 * out ("Şifre değiştir" in the user menu is for that).
 */
export function RowActions({
  user,
  isCurrentUser,
  onNotice,
}: {
  user: PanelUser;
  isCurrentUser: boolean;
  onNotice: (notice: Notice) => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"rename" | "password" | "delete" | null>(
    null,
  );
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const disabled = !!user.banned;
  const toggleDisabled = useMutation({
    mutationFn: () => setPanelUserDisabled(user.id, !disabled),
    onSuccess: () => {
      onNotice({
        tone: "success",
        text: disabled
          ? `${user.name} tekrar giriş yapabilir.`
          : `${user.name} devre dışı bırakıldı ve oturumları kapatıldı.`,
      });
      return queryClient.invalidateQueries({ queryKey: ["panel-users"] });
    },
    onError: (error) => onNotice({ tone: "error", text: error.message }),
  });

  const resend = useMutation({
    mutationFn: () => sendVerificationEmail(user.id),
    onSuccess: () =>
      onNotice({
        tone: "success",
        text: `${user.email} adresine giriş bağlantısı gönderildi.`,
      }),
    onError: (error) => onNotice({ tone: "error", text: error.message }),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${user.name} işlemleri`}
              className="text-muted-foreground"
            >
              <Ellipsis />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            <Pencil />
            Adı düzenle
          </DropdownMenuItem>
          {!isCurrentUser && (
            <DropdownMenuItem onClick={() => setDialog("password")}>
              <KeyRound />
              Şifre belirle
            </DropdownMenuItem>
          )}
          {/* a disabled user's link would only lead to "devre dışı" */}
          {!user.emailVerified && !disabled && (
            <DropdownMenuItem
              disabled={resend.isPending}
              onClick={() => resend.mutate()}
            >
              <MailCheck />
              Doğrulama e-postası gönder
            </DropdownMenuItem>
          )}
          {!isCurrentUser && (
            <>
              <DropdownMenuItem
                disabled={toggleDisabled.isPending}
                onClick={() => toggleDisabled.mutate()}
              >
                {disabled ? <CircleCheck /> : <CirclePause />}
                {disabled ? "Etkinleştir" : "Devre dışı bırak"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog("delete")}
              >
                <Trash2 />
                Sil
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        user={user}
        isCurrentUser={isCurrentUser}
        open={dialog === "rename"}
        onOpenChange={closeDialog}
      />
      {!isCurrentUser && (
        <>
          <SetPasswordDialog
            user={user}
            open={dialog === "password"}
            onOpenChange={closeDialog}
          />
          <DeleteDialog
            user={user}
            open={dialog === "delete"}
            onOpenChange={closeDialog}
          />
        </>
      )}
    </>
  );
}

function DeleteDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PanelUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deletePanelUser(user.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["panel-users"] });
      onOpenChange(false);
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{user.name} silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            Hesap kalıcı olarak silinir ve kullanıcı panele giriş yapamaz.
            Geçici olarak engellemek için “Devre dışı bırak”ı kullanabilirsiniz.
            Bu işlem geri alınamaz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error.message}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={() => mutate()}
          >
            {isPending ? "Siliniyor…" : "Sil"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
