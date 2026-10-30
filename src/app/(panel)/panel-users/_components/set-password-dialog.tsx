"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { type PanelUser, setPanelUserPassword } from "@/lib/fetches/panel-user";
import { generatePassword } from "@/lib/password";
import { setPanelUserPasswordSchema } from "@/lib/zod-schemas/panel-user";
import { CopyButton, PasswordField } from "./password-field";

/** For someone else's account; your own goes through "Şifre değiştir" */
export function SetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PanelUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SetPasswordForm user={user} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SetPasswordForm({
  user,
  onClose,
}: {
  user: PanelUser;
  onClose: () => void;
}) {
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(setPanelUserPasswordSchema),
    defaultValues: { password: generatePassword() },
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: ({ password }: { password: string }) =>
      setPanelUserPassword(user.id, password).then(() => password),
    onSuccess: setSavedPassword,
  });

  if (savedPassword) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Şifre değiştirildi</DialogTitle>
          <DialogDescription>
            {user.name} tüm cihazlarda oturumdan çıkarıldı. Yeni şifreyi
            kullanıcıya iletin.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-1.5 font-mono text-sm">
            {savedPassword}
          </code>
          <CopyButton text={savedPassword} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Tamam</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Şifre belirle</DialogTitle>
        <DialogDescription>
          {user.name} için yeni bir şifre belirlenir ve kullanıcı tüm cihazlarda
          oturumdan çıkarılır.
        </DialogDescription>
      </DialogHeader>
      <form
        id="set-panel-user-password"
        onSubmit={form.handleSubmit((values) => mutate(values))}
        noValidate
      >
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor="new-password">Yeni şifre</FieldLabel>
              <PasswordField
                id="new-password"
                value={field.value}
                onChange={field.onChange}
                invalid={!!fieldState.error}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {error && <FieldError className="mt-3">{error.message}</FieldError>}
      </form>
      <DialogFooter>
        <Button
          type="submit"
          form="set-panel-user-password"
          disabled={isPending}
        >
          {isPending ? "Kaydediliyor…" : "Şifreyi kaydet"}
        </Button>
      </DialogFooter>
    </>
  );
}
