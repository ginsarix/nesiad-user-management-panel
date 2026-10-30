import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
import { type MemberDetails, removeMemberLogo } from "@/lib/fetches/member";

/** `onDeleted` closes the logo dialog this button sits in */
export function DeleteLogoButton({
  member,
  onDeleted,
}: {
  member: MemberDetails;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => removeMemberLogo(member.id),
    onSuccess: () => {
      onDeleted();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        // yetkili pages show member logos
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
      ]);
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
            Logo Sil
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Logo silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            {member.title} üyesinin logosu kalıcı olarak silinir.
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
