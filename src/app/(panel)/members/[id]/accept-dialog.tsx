"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { displayToIso, isoToDisplay, todayInIstanbul } from "@/lib/dates";
import type { MemberDetails } from "@/lib/fetches/member";
import { noticeWarning } from "@/lib/notice-outcome";
import { acceptDecisionSchema } from "@/lib/zod-schemas/member-decision";
import { SectorCombobox } from "../_components/sector-combobox";
import { NoticeBox, SavedWithWarning, useDecision } from "./decision-parts";

export type AcceptMode = "accept" | "add_passive";

/** Kabul Et (notifies the applicant) and Pasif olarak ekle (does not) */
export function AcceptDialog({
  member,
  mode,
  open,
  onOpenChange,
}: {
  member: MemberDetails;
  mode: AcceptMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* mounted per opening, so each one starts from today and the stored sector */}
        <AcceptForm
          member={member}
          mode={mode}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AcceptForm({
  member,
  mode,
  onClose,
}: {
  member: MemberDetails;
  mode: AcceptMode;
  onClose: () => void;
}) {
  const accepting = mode === "accept";
  const [loginDate, setLoginDate] = useState(() =>
    isoToDisplay(todayInIstanbul()),
  );
  // the decision overwrites the stored sector, so start from it
  const [sectorId, setSectorId] = useState<number | null>(member.sectorId);
  const [validation, setValidation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const { mutate, isPending, error } = useDecision();

  const confirm = () => {
    const decision = acceptDecisionSchema.safeParse({
      decision: mode,
      memberLoginDate: displayToIso(loginDate),
      sectorId,
    });
    if (!decision.success) {
      setValidation(decision.error.issues[0]?.message ?? "Geçersiz bilgi");
      return;
    }
    setValidation(null);

    mutate(
      { id: member.id, decision: decision.data },
      {
        onSuccess: ({ notices }) => {
          const text = noticeWarning(notices);
          if (text) setWarning(text);
          else onClose();
        },
      },
    );
  };

  if (warning) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Karar kaydedildi</DialogTitle>
        </DialogHeader>
        <SavedWithWarning
          saved={`${member.title} aktif üye oldu. Karar kaydedildi, geri alınmadı.`}
          warning={warning}
        />
        <DialogFooter>
          <Button onClick={onClose}>Kapat</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {accepting ? "Başvuruyu kabul et" : "Pasif üye olarak ekle"}
        </DialogTitle>
        <DialogDescription>
          {accepting
            ? `${member.title} aktif üye olacak.`
            : `${member.title} pasif üye olacak. Başvurana bildirim gönderilmez.`}
        </DialogDescription>
      </DialogHeader>

      <Field data-invalid={!!validation}>
        <FieldLabel htmlFor="decision-login-date">Üye Giriş Tarihi</FieldLabel>
        <DatePickerInput
          id="decision-login-date"
          value={loginDate}
          onChange={setLoginDate}
          aria-invalid={!!validation}
        />
        {validation && <FieldError>{validation}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="decision-sector">Sektör</FieldLabel>
        <SectorCombobox
          id="decision-sector"
          value={sectorId}
          onChange={setSectorId}
        />
      </Field>

      {accepting && <NoticeBox member={member} />}

      {error && <FieldError>{error.message}</FieldError>}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button disabled={isPending} onClick={confirm}>
          {isPending
            ? "Kaydediliyor…"
            : accepting
              ? "Kabul Et ve Bildir"
              : "Pasif olarak ekle"}
        </Button>
      </DialogFooter>
    </>
  );
}
