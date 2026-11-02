"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { displayToIso, isoToDisplay, todayInIstanbul } from "@/lib/dates";
import {
  getSmsCelebrations,
  getSmsSettings,
  type SmsCelebrationsResponse,
} from "@/lib/fetches/sms";
import { type Celebration, celebrationLabel } from "@/lib/sms/celebrations";
import { celebrationMessage } from "@/lib/sms/templates";
import { INVALID_DATE_MESSAGE } from "@/lib/zod-schemas/shared";
import type { SmsSettingsValues } from "@/lib/zod-schemas/sms";
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
  const { data: settings } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: () => getSmsSettings(),
  });
  const celebrations = data?.celebrations ?? [];
  const sends = new Map(
    (data?.sends ?? []).map((s) => [`${s.kind}:${s.contactId}`, s]),
  );

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
          Şubat'ta kutlanır.{" "}
          {settings &&
            (settings.autoEnabled
              ? `Otomatik gönderim açık: her gün ${settings.sendTime}'dan sonra.`
              : "Otomatik gönderim kapalı (Ayarlar).")}
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
          sends={sends}
          settings={settings}
        />
        <CelebrationGroup
          title="Doğum günleri"
          celebrations={celebrations.filter((c) => c.kind === "birthday")}
          sends={sends}
          settings={settings}
        />
      </div>
    </div>
  );
}

type Send = SmsCelebrationsResponse["sends"][number];

function CelebrationGroup({
  title,
  celebrations,
  sends,
  settings,
}: {
  title: string;
  celebrations: Celebration[];
  sends: Map<string, Send>;
  settings?: SmsSettingsValues;
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
        {celebrations.map((c) => {
          const send = sends.get(`${c.kind}:${c.contact.id}`);
          // what went out, else what would go out with today's settings
          const message =
            send?.message ??
            (c.phone.ok && settings ? celebrationMessage(c, settings) : null);
          return (
            <li
              key={`${c.contact.kind}:${c.contact.id}`}
              className="flex flex-col gap-1 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
              </div>
              {message && (
                <p className="text-xs text-muted-foreground">{message}</p>
              )}
              {send && <SendStatus send={send} />}
            </li>
          );
        })}
        {celebrations.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            Bu tarihte yok
          </li>
        )}
      </ul>
    </div>
  );
}

const timeFormat = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
});

/** What the daily job did for this person on this day */
function SendStatus({ send }: { send: Send }) {
  const at = timeFormat.format(new Date(send.sentAt ?? send.createdAt));
  const text = {
    sent: `Gönderildi ${at} · NetGSM iş no ${send.jobId}`,
    failed: `Gönderilemedi ${at}: ${send.error}`,
    unknown: `${at}: ${send.error}`,
    pending: `${at} itibarıyla gönderilmedi (sunucu gönderim sırasında durdu); tekrar denenmeyecek`,
  }[send.status];
  return (
    <p
      className={`text-xs ${send.status === "sent" ? "text-primary" : "text-destructive"}`}
    >
      {text}
    </p>
  );
}
