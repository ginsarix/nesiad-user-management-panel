"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { FieldError } from "@/components/ui/field";
import { changePanelUserPhone, type PanelUser } from "@/lib/fetches/panel-user";
import { formatPhone } from "@/lib/sms/phone";
import { changePanelUserPhoneSchema } from "@/lib/zod-schemas/panel-user";
import { PhoneVerificationFields } from "./phone-verification-fields";

type Values = z.infer<typeof changePanelUserPhoneSchema>;

export function ChangePhoneDialog({
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
        <DialogHeader>
          <DialogTitle>Telefonu değiştir</DialogTitle>
          <DialogDescription>
            {user.name} için
            {user.phone
              ? ` şu anki numara: ${formatPhone(user.phone)}.`
              : " kayıtlı numara yok."}
          </DialogDescription>
        </DialogHeader>
        {/* the content unmounts when closed, so each opening starts fresh */}
        <ChangePhoneForm user={user} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ChangePhoneForm({
  user,
  onSaved,
}: {
  user: PanelUser;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(changePanelUserPhoneSchema),
    defaultValues: { phone: "", code: "" },
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: (values: Values) => changePanelUserPhone(user.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["panel-users"] });
      onSaved();
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      className="flex flex-col gap-4"
      noValidate
    >
      <PhoneVerificationFields
        control={form.control}
        userId={user.id}
        idPrefix="change-"
      />
      {error && <FieldError>{error.message}</FieldError>}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Doğrula ve kaydet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
