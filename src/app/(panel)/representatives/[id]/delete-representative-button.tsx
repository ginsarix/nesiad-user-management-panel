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
  deleteRepresentative,
  type RepresentativeDetails,
} from "@/lib/fetches/representative";
import { invalidateSmsQueries } from "@/lib/fetches/sms";
import { listHref } from "@/lib/list-href";

export function DeleteRepresentativeButton({
  representative,
}: {
  representative: RepresentativeDetails;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteRepresentative(representative.id),
    onSuccess: async () => {
      await Promise.all([
        // only the list: refetching this yetkili now would just 404
        queryClient.invalidateQueries({
          queryKey: ["representatives"],
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        // it's taken out of its Organizasyon groups, freeing their görevler
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
        invalidateSmsQueries(queryClient),
      ]);
      router.push(listHref("/representatives"));
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
          <AlertDialogTitle>
            {representative.name} silinsin mi?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Yetkili kalıcı olarak silinir, üyelerle bağlantısı kaldırılır ve
            organizasyonlardan çıkarılır. Üyeler silinmez. Bu işlem geri
            alınamaz.
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
