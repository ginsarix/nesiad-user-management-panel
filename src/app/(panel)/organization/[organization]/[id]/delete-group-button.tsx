"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  deleteOrganizationGroup,
  type OrganizationGroup,
} from "@/lib/fetches/organization";
import { listHref } from "@/lib/list-href";
import {
  ORGANIZATION_INFO,
  type Organization,
  organizationHref,
} from "@/lib/organizations";

export function DeleteGroupButton({
  organization,
  group,
}: {
  organization: Organization;
  group: OrganizationGroup;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteOrganizationGroup(organization, group.id),
    onSuccess: async () => {
      await Promise.all([
        // only the list: refetching this group now would just 404
        queryClient.invalidateQueries({
          queryKey: ["organizations", organization],
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
      ]);
      router.push(listHref(organizationHref(organization)));
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) reset();
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="destructive">
            <Trash2 />
            Sil
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>“{group.name}” silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            {ORGANIZATION_INFO[organization].singular} ve kişi listesi kalıcı
            olarak silinir. Yetkililer silinmez. Bu işlem geri alınamaz.
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
