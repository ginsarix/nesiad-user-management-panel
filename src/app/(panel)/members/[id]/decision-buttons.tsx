"use client";

import { Check, RotateCcw, UserRoundCheck, X } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { MemberDetails } from "@/lib/fetches/member";
import { noticeWarning } from "@/lib/notice-outcome";
import { REJECTION_NOTE_MAX } from "@/lib/zod-schemas/member-decision";
import { AcceptDialog, type AcceptMode } from "./accept-dialog";
import { NoticeBox, SavedWithWarning, useDecision } from "./decision-parts";

type OpenDialog = AcceptMode | "reject" | null;

/**
 * Decision actions of an application: Kabul Et, Reddet and Pasif olarak ekle
 * for an Aday, Tekrar Aday yap for a Reddedildi. The dialogs stay mounted
 * when the status changes under them, so a notice warning can still be read.
 */
export function DecisionButtons({ member }: { member: MemberDetails }) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const reopen = useDecision();

  return (
    <>
      {member.status === "candidate" && (
        <>
          <Button onClick={() => setDialog("accept")}>
            <Check />
            Kabul Et
          </Button>
          <Button variant="outline" onClick={() => setDialog("reject")}>
            <X />
            Reddet
          </Button>
          <Button variant="outline" onClick={() => setDialog("add_passive")}>
            <UserRoundCheck />
            Pasif olarak ekle
          </Button>
        </>
      )}
      {member.status === "rejected" && (
        <Button
          variant="outline"
          disabled={reopen.isPending}
          onClick={() =>
            reopen.mutate(
              { id: member.id, decision: { decision: "reopen" } },
              { onError: (error) => window.alert(error.message) },
            )
          }
        >
          <RotateCcw />
          Tekrar Aday yap
        </Button>
      )}

      <AcceptDialog
        member={member}
        mode={dialog === "add_passive" ? "add_passive" : "accept"}
        open={dialog === "accept" || dialog === "add_passive"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <RejectDialog
        member={member}
        open={dialog === "reject"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </>
  );
}

function RejectDialog({
  member,
  open,
  onOpenChange,
}: {
  member: MemberDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [warning, setWarning] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { mutate, isPending, error, reset } = useDecision();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          reset();
          setWarning(null);
          setNote("");
        }
      }}
    >
      <AlertDialogContent>
        {warning ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Karar kaydedildi</AlertDialogTitle>
            </AlertDialogHeader>
            <SavedWithWarning
              saved={`${member.title} başvurusu reddedildi. Karar kaydedildi, geri alınmadı.`}
              warning={warning}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Kapat</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Başvuruyu reddet</AlertDialogTitle>
              <AlertDialogDescription>
                {member.title} başvurusu reddedilecek. Kayıt silinmez,
                &quot;Reddedilenler&quot; filtresinde kalır.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor="rejection-note">Ret Notu</FieldLabel>
              <Textarea
                id="rejection-note"
                rows={3}
                maxLength={REJECTION_NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <FieldDescription>
                İsteğe bağlı. Sadece panelde görünür, başvurana gönderilmez.
              </FieldDescription>
            </Field>
            <NoticeBox member={member} />
            {error && <FieldError>{error.message}</FieldError>}
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={() =>
                  mutate(
                    { id: member.id, decision: { decision: "reject", note } },
                    {
                      onSuccess: ({ notices }) => {
                        const text = noticeWarning(notices);
                        if (text) setWarning(text);
                        else onOpenChange(false);
                      },
                    },
                  )
                }
              >
                {isPending ? "Kaydediliyor…" : "Reddet ve Bildir"}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
