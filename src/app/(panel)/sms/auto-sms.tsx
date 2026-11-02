"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { displayToIso, isoToDisplay, todayInIstanbul } from "@/lib/dates";
import { getSmsCelebrations } from "@/lib/fetches/sms";
import { type Celebration, celebrationLabel } from "@/lib/sms/celebrations";
import { INVALID_DATE_MESSAGE } from "@/lib/zod-schemas/shared";
import { PhoneHint } from "./manual-sms";

export function AutoSms() {
  const today = todayInIstanbul();
  const [text, setText] = useState(() => isoToDisplay(today));
  const date = displayToIso(text);

  const { data, isError, isFetching } = useQuery({
    queryKey: ["sms-celebrations", date],
    queryFn: () => getSmsCelebrations(date),
    enabled: date !== "",
    placeholderData: keepPreviousData,
  });
  const celebrations = data?.celebrations ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <Field className="w-44" data-invalid={date === ""}>
          <FieldLabel htmlFor="sms-simulated-date">Simüle tarih</FieldLabel>
          <DatePickerInput
            id="sms-simulated-date"
            value={text}
            onChange={setText}
            aria-invalid={date === ""}
            allowFuture
          />
        </Field>
        <Button
          variant="outline"
          disabled={date === today}
          onClick={() => setText(isoToDisplay(today))}
        >
          Bugün
        </Button>
        <p className="basis-full text-xs text-muted-foreground">
          Bu tarihte otomatik SMS alacak aktif üyeler (kuruluş yıl dönümü) ve
          yetkililer (doğum günü). 29 Şubat, artık yıl olmayan yıllarda 28
          Şubat'ta kutlanır. Otomatik gönderim henüz kapalı.
        </p>
        {date === "" && <FieldError>{INVALID_DATE_MESSAGE}</FieldError>}
        {isError && (
          <p className="text-sm text-destructive">Kutlamalar yüklenemedi.</p>
        )}
      </div>

      <div
        className={`flex flex-col gap-4 ${isFetching ? "opacity-60" : ""}`}
        aria-busy={isFetching}
      >
        <CelebrationGroup
          title="Kuruluş yıl dönümleri"
          celebrations={celebrations.filter((c) => c.kind === "founding")}
        />
        <CelebrationGroup
          title="Doğum günleri"
          celebrations={celebrations.filter((c) => c.kind === "birthday")}
        />
      </div>
    </div>
  );
}

function CelebrationGroup({
  title,
  celebrations,
}: {
  title: string;
  celebrations: Celebration[];
}) {
  const sendable = celebrations.filter((c) => c.phone.ok).length;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-medium">
        {title}
        <span className="ml-auto font-normal text-muted-foreground">
          {sendable} / {celebrations.length} SMS
        </span>
      </div>
      <ul>
        {celebrations.map((c) => (
          <li
            key={`${c.contact.kind}:${c.contact.id}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-sm"
          >
            <Link
              href={`/${c.contact.kind === "member" ? "members" : "representatives"}/${c.contact.id}`}
              className="truncate hover:underline"
            >
              {c.contact.name}
            </Link>
            <span className="text-muted-foreground">
              {celebrationLabel(c)} · {isoToDisplay(c.date)}
            </span>
            <PhoneHint phone={c.contact.phone} />
          </li>
        ))}
        {celebrations.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            Bu tarihte yok
          </li>
        )}
      </ul>
    </div>
  );
}
