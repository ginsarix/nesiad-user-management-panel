"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type PanelUser, renamePanelUser } from "@/lib/fetches/panel-user";
import { renamePanelUserSchema } from "@/lib/zod-schemas/panel-user";

export function RenameDialog({
  user,
  isCurrentUser,
  open,
  onOpenChange,
}: {
  user: PanelUser;
  isCurrentUser: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adı düzenle</DialogTitle>
        </DialogHeader>
        <RenameForm
          user={user}
          isCurrentUser={isCurrentUser}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  user,
  isCurrentUser,
  onSaved,
}: {
  user: PanelUser;
  isCurrentUser: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(renamePanelUserSchema),
    defaultValues: { name: user.name },
  });
  const { errors } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: ({ name }: { name: string }) => renamePanelUser(user.id, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["panel-users"] });
      // the header's user menu is rendered on the server
      if (isCurrentUser) router.refresh();
      onSaved();
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="rename-name">Ad Soyad</FieldLabel>
        <Input
          id="rename-name"
          autoComplete="off"
          autoFocus
          aria-invalid={!!errors.name}
          {...form.register("name")}
        />
        <FieldError errors={[errors.name]} />
      </Field>
      {error && <FieldError>{error.message}</FieldError>}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
