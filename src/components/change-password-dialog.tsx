"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { changePasswordFormSchema } from "@/lib/zod-schemas/auth";

type Values = z.infer<typeof changePasswordFormSchema>;

const emptyValues: Values = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [done, setDone] = useState(false);
  const form = useForm({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: emptyValues,
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ currentPassword, newPassword }: Values) {
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      // log out other devices; this one gets a fresh session
      revokeOtherSessions: true,
    });
    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
      return;
    }
    setDone(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          form.reset(emptyValues);
          setDone(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Şifre değiştir</DialogTitle>
          {done && (
            <DialogDescription>Şifreniz değiştirildi.</DialogDescription>
          )}
        </DialogHeader>

        {!done && (
          <form
            id="change-password"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <Field data-invalid={!!errors.currentPassword}>
              <FieldLabel htmlFor="currentPassword">Mevcut şifre</FieldLabel>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.currentPassword}
                {...form.register("currentPassword")}
              />
              <FieldError errors={[errors.currentPassword]} />
            </Field>
            <Field data-invalid={!!errors.newPassword}>
              <FieldLabel htmlFor="newPassword">Yeni şifre</FieldLabel>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...form.register("newPassword")}
              />
              <FieldError errors={[errors.newPassword]} />
            </Field>
            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmPassword">
                Yeni şifre (tekrar)
              </FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...form.register("confirmPassword")}
              />
              <FieldError errors={[errors.confirmPassword]} />
            </Field>
            <FieldError errors={[errors.root]} />
          </form>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>Tamam</Button>
          ) : (
            <Button
              type="submit"
              form="change-password"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Kaydediliyor…" : "Şifreyi kaydet"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
