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
import { deleteProject, type Project } from "@/lib/fetches/project";
import { listHref } from "@/lib/list-href";

/** A proje with tahsilatlar can't be deleted; the dialog says why instead */
export function DeleteProjectButton({ project }: { project: Project }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const hasCollections = project.collectionCount > 0;

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: async () => {
      // only the list: refetching this proje now would just 404
      await queryClient.invalidateQueries({
        queryKey: ["projects"],
        exact: true,
      });
      router.push(listHref("/projects"));
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
        {hasCollections ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Bu proje silinemez</AlertDialogTitle>
              <AlertDialogDescription>
                “{project.name}” projesine ait {project.collectionCount}{" "}
                tahsilat var. Silmek yerine projeyi pasif yapabilirsiniz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Tamam</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>“{project.name}” silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                Proje kalıcı olarak silinir. Bu işlem geri alınamaz.
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
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
