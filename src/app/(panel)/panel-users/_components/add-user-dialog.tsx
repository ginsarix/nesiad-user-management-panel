"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { createPanelUser } from "@/lib/fetches/panel-user";
import { generatePassword } from "@/lib/password";
import { addPanelUserSchema } from "@/lib/zod-schemas/panel-user";
import { CopyButton, PasswordField } from "./password-field";
import { PhoneVerificationFields } from "./phone-verification-fields";

type Values = z.infer<typeof addPanelUserSchema>;

/** What to tell the admin once the account exists */
type Created = { email: string; password: string; emailError: string | null };

export function AddUserDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Kullanıcı Ekle
      </Button>
      <DialogContent>
        {/* the content unmounts when closed, so each opening starts fresh */}
        <AddUserForm onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddUserForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<Created | null>(null);

  const form = useForm({
    resolver: zodResolver(addPanelUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      code: "",
      password: generatePassword(),
    },
  });
  const { errors } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: Values) => ({
      ...(await createPanelUser(values)),
      email: values.email,
      password: values.password,
    }),
    onSuccess: async (result) => {
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: ["panel-users"] });
    },
  });

  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Kullanıcı eklendi</DialogTitle>
          <DialogDescription>
            {created.emailError
              ? `Hesap oluşturuldu ancak giriş bağlantısı e-postası gönderilemedi (${created.emailError}). Listeden “Doğrulama e-postası gönder” ile tekrar deneyebilirsiniz.`
              : `${created.email} adresine giriş bağlantısı gönderildi. Bağlantı hesabı doğrular ve kullanıcıyı bir kez giriş yaptırır. Aşağıdaki şifreyi kullanıcıya iletin.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-1.5 font-mono text-sm">
            {created.password}
          </code>
          <CopyButton text={created.password} />
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
        <DialogTitle>Yeni Panel Kullanıcısı</DialogTitle>
        <DialogDescription>
          Kullanıcıya e-posta ile bir giriş bağlantısı gönderilir. Şifreyi
          ayrıca siz iletirsiniz; ilk girişte değiştirebilir.
        </DialogDescription>
      </DialogHeader>
      <form
        id="add-panel-user"
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Ad Soyad</FieldLabel>
          <Input
            id="name"
            autoComplete="off"
            autoFocus
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">E-posta</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <PhoneVerificationFields control={form.control} />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor="password">Şifre</FieldLabel>
              <PasswordField
                id="password"
                value={field.value}
                onChange={field.onChange}
                invalid={!!fieldState.error}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {error && <FieldError>{error.message}</FieldError>}
      </form>
      <DialogFooter>
        <Button type="submit" form="add-panel-user" disabled={isPending}>
          {isPending ? "Ekleniyor…" : "Doğrula, ekle ve e-posta gönder"}
        </Button>
      </DialogFooter>
    </>
  );
}
