"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, SearchIcon, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getSmsContacts,
  type SmsSendResponse,
  sendSms,
} from "@/lib/fetches/sms";
import { normalizePhone } from "@/lib/sms/phone";
import {
  buildRecipients,
  type Contact,
  type SkipReason,
} from "@/lib/sms/recipients";
import { foldTr } from "@/lib/turkish";
import {
  SMS_MAX_LENGTH,
  type SmsFormValues,
  smsFormSchema,
} from "@/lib/zod-schemas/sms";

const keyOf = (c: Contact) => `${c.kind}:${c.id}`;

const SKIP_LABELS: Record<SkipReason, string> = {
  no_phone: "telefonsuz",
  invalid: "geçersiz",
  duplicate: "tekrar",
};

export function ManualSms() {
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ["sms-contacts"],
    queryFn: () => getSmsContacts(),
  });
  const contacts = data?.contacts ?? [];

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastSend, setLastSend] = useState<SmsSendResponse | null>(null);

  const form = useForm<SmsFormValues>({
    resolver: zodResolver(smsFormSchema),
    defaultValues: { message: "" },
  });
  const message = useWatch({ control: form.control, name: "message" });
  const { errors } = form.formState;

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selected.has(keyOf(c))),
    [contacts, selected],
  );
  // the same function the API runs, so the preview matches the send
  const { recipients, skipped } = useMemo(
    () => buildRecipients(selectedContacts),
    [selectedContacts],
  );
  const skipCounts = Object.entries(SKIP_LABELS)
    .map(([reason, label]) => ({
      label,
      count: skipped.filter((s) => s.reason === reason).length,
    }))
    .filter((s) => s.count > 0);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: (message: string) =>
      sendSms({
        message,
        memberIds: selectedContacts
          .filter((c) => c.kind === "member")
          .map((c) => c.id),
        representativeIds: selectedContacts
          .filter((c) => c.kind === "representative")
          .map((c) => c.id),
      }),
    onSuccess: async (result) => {
      setLastSend(result);
      setConfirmOpen(false);
      setSelected(new Set());
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });

  function toggle(keys: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  const needle = foldTr(query.trim());
  const visible = needle
    ? contacts.filter(
        (c) =>
          foldTr(c.name).includes(needle) || (c.phone ?? "").includes(needle),
      )
    : contacts;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <div className="flex flex-col gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="İsim veya telefon ara"
            aria-label="İsim veya telefon ara"
            className="bg-card pl-8"
          />
        </div>
        {isError && (
          <p className="text-sm text-destructive">Kişiler yüklenemedi.</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <ContactGroup
            title="Üyeler"
            contacts={visible.filter((c) => c.kind === "member")}
            selected={selected}
            onToggle={toggle}
          />
          <ContactGroup
            title="Yetkililer"
            contacts={visible.filter((c) => c.kind === "representative")}
            selected={selected}
            onToggle={toggle}
          />
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit(() => {
          reset();
          setConfirmOpen(true);
        })}
        className="flex h-fit flex-col gap-4 rounded-lg border bg-card p-4"
        noValidate
      >
        <Field data-invalid={!!errors.message}>
          <FieldLabel htmlFor="sms-message">Mesaj</FieldLabel>
          <Textarea
            id="sms-message"
            rows={6}
            aria-invalid={!!errors.message}
            {...form.register("message")}
          />
          <FieldDescription>
            {message.length} / {SMS_MAX_LENGTH} karakter
          </FieldDescription>
          <FieldError errors={[errors.message]} />
        </Field>

        <div className="text-sm">
          <span className="font-medium">{recipients.length} alıcı</span>
          {skipCounts.map((s) => (
            <span key={s.label} className="text-muted-foreground">
              {" "}
              · {s.count} {s.label}
            </span>
          ))}
        </div>

        <Button type="submit" disabled={recipients.length === 0}>
          <Send />
          Gönder
        </Button>

        {data?.dryRun && (
          <p className="text-xs text-muted-foreground">
            Deneme modu: SMS'ler NetGSM'e gitmez, kredi harcanmaz.
          </p>
        )}

        {lastSend && (
          <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              {lastSend.recipientCount} kişiye gönderildi
              {lastSend.dryRun && " (deneme)"}.
              <div className="text-muted-foreground">
                NetGSM iş no: {lastSend.jobId}
              </div>
            </div>
          </div>
        )}
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {recipients.length} kişiye SMS gönderilsin mi?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {data?.dryRun
                ? "Deneme modu açık: gerçek SMS gönderilmez."
                : "SMS hemen gönderilir ve geri alınamaz."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error.message}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => mutate(form.getValues("message"))}
            >
              {isPending ? "Gönderiliyor…" : "Gönder"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContactGroup({
  title,
  contacts,
  selected,
  onToggle,
}: {
  title: string;
  contacts: Contact[];
  selected: ReadonlySet<string>;
  onToggle: (keys: string[], on: boolean) => void;
}) {
  const keys = contacts.map(keyOf);
  const selectedCount = keys.filter((k) => selected.has(k)).length;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <label
        htmlFor={`sms-all-${title}`}
        className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-medium"
      >
        <Checkbox
          id={`sms-all-${title}`}
          checked={keys.length > 0 && selectedCount === keys.length}
          indeterminate={selectedCount > 0 && selectedCount < keys.length}
          disabled={keys.length === 0}
          onCheckedChange={(on) => onToggle(keys, on)}
        />
        {title}
        <span className="ml-auto font-normal text-muted-foreground">
          {selectedCount} / {keys.length}
        </span>
      </label>
      <ul className="max-h-[calc(100svh-16rem)] overflow-y-auto">
        {contacts.map((contact) => {
          const key = keyOf(contact);
          return (
            <li key={key}>
              <label
                htmlFor={`sms-${key}`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  id={`sms-${key}`}
                  checked={selected.has(key)}
                  onCheckedChange={(on) => onToggle([key], on)}
                />
                <span className="truncate">{contact.name}</span>
                <PhoneHint phone={contact.phone} />
              </label>
            </li>
          );
        })}
        {contacts.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            Kimse yok
          </li>
        )}
      </ul>
    </div>
  );
}

/** The stored phone, and how normalizePhone reads it */
function PhoneHint({ phone }: { phone: string | null }) {
  if (!phone) {
    return (
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        telefon yok
      </span>
    );
  }
  const result = normalizePhone(phone);
  return (
    <span
      className={`ml-auto shrink-0 text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}
      title={phone}
    >
      {result.ok
        ? result.phone
        : `${PHONE_PROBLEM_LABELS[result.reason]}: ${phone}`}
    </span>
  );
}

const PHONE_PROBLEM_LABELS = {
  landline: "sabit hat",
  length: "eksik/fazla hane",
  unknown: "tanınmayan numara",
} as const;
