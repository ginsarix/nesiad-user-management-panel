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
import {
  type MemberCompany,
  type MemberDetails,
  removeMemberLogo,
} from "@/lib/fetches/member";
import { invalidateLogoQueries } from "./change-logo-button";

/** `onDeleted` closes the logo dialog this button sits in */
export function DeleteLogoButton({
  member,
  company,
  onDeleted,
}: {
  member: MemberDetails;
  company: MemberCompany;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => removeMemberLogo(member.id),
    onSuccess: () => {
      onDeleted();
      return invalidateLogoQueries(queryClient);
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
            {company.title} firmasının logosu kalıcı olarak silinir.
            {company.memberCount > 1 &&
              " Firmanın diğer üyelerinde de artık görünmez."}
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
