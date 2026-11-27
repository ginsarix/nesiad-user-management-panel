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
import { deleteMember, type MemberDetails } from "@/lib/fetches/member";
import { invalidateSmsQueries } from "@/lib/fetches/sms";
import { listHref } from "@/lib/list-href";
import { hasMemberRecords, memberRecordsText } from "@/lib/member-records";

export function DeleteMemberButton({ member }: { member: MemberDetails }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteMember(member.id),
    onSuccess: async () => {
      await Promise.all([
        // only the list: refetching this member now would just 404
        queryClient.invalidateQueries({ queryKey: ["members"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["sectors"] }),
        // its company goes too when it was the last member
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        // it's taken out of its Organizasyon groups, freeing their görevler
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        invalidateSmsQueries(queryClient),
      ]);
      router.push(listHref("/members"));
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
        {hasMemberRecords(member.recordCounts) ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Bu üye silinemez</AlertDialogTitle>
              <AlertDialogDescription>
                “{member.name}” adlı üyeye ait{" "}
                {memberRecordsText(member.recordCounts)} var. Silmek yerine
                üyeyi pasif yapabilirsiniz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Tamam</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{member.name} silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                Üye kalıcı olarak silinir ve organizasyonlardan çıkarılır.
                {member.company &&
                  (member.company.memberCount > 1
                    ? " Firması diğer üyelerinde kalır."
                    : ` Başka üyesi olmadığı için ${member.company.title} firması da silinir.`)}{" "}
                Bu işlem geri alınamaz.
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
