"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getCollectionNoticeTemplates,
  updateCollectionNoticeTemplates,
} from "@/lib/fetches/sms";
import {
  COLLECTION_NOTICE_PLACEHOLDERS,
  fillTemplate,
} from "@/lib/sms/templates";
import {
  type CollectionNoticeSettingsValues,
  collectionNoticeSettingsSchema,
} from "@/lib/zod-schemas/collection-notices";
import { SMS_MAX_LENGTH } from "@/lib/zod-schemas/sms";

const SAMPLE = {
  uye: "Kapadokya Gıda A.Ş.",
  tutar: "₺1.250,00",
  tarih: "10.11.2026",
  tur: "Aidat",
  tip: "Kart",
  proje: "Kreş Projesi (PR-7)",
};

type FormApi = ReturnType<typeof useForm<CollectionNoticeSettingsValues>>;

/** The SMS and email templates sent when a tahsilat is recorded */
export function CollectionNoticeSettings() {
  const { data, isError } = useQuery({
    queryKey: ["collection-notice-settings"],
    queryFn: () => getCollectionNoticeTemplates(),
  });

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Tahsilat bildirim şablonları yüklenemedi.
      </p>
    );
  }
  return data ? <CollectionNoticeSettingsForm settings={data} /> : null;
}

function CollectionNoticeSettingsForm({
  settings,
}: {
  settings: CollectionNoticeSettingsValues;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const form = useForm<CollectionNoticeSettingsValues>({
    resolver: zodResolver(collectionNoticeSettingsSchema),
    defaultValues: settings,
  });
  const { isDirty } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: updateCollectionNoticeTemplates,
    onSuccess: async (values) => {
      form.reset(values);
      setSaved(true);
      queryClient.setQueryData(["collection-notice-settings"], values);
      await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      onChange={() => setSaved(false)}
      className="flex max-w-3xl flex-col gap-6 rounded-lg border bg-card p-4"
      noValidate
    >
      <div>
        <h2 className="font-medium">Tahsilat Bildirimleri</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Yeni bir tahsilat kaydedilince üyeye ve tahsilatı kaydeden dışındaki
          bütün aktif panel kullanıcılarına hem SMS hem e-posta gider. Üyenin
          SMS'i Telefon numarasına gider. Tahsilat düzenlenince veya silinince
          bildirim gönderilmez.
        </p>
      </div>

      <Notice form={form} title="Üyeye Giden Bildirim" prefix="member" />
      <Notice
        form={form}
        title="Panel Kullanıcılarına Giden Bildirim"
        prefix="staff"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!isDirty || isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {saved && !isDirty && (
          <span className="flex items-center gap-1.5 text-sm text-primary">
            <CircleCheck className="size-4" />
            Kaydedildi
          </span>
        )}
        {error && <FieldError>{error.message}</FieldError>}
      </div>
    </form>
  );
}

function Notice({
  form,
  title,
  prefix,
}: {
  form: FormApi;
  title: string;
  prefix: "member" | "staff";
}) {
  const { errors } = form.formState;
  const smsName = `${prefix}Sms` as const;
  const subjectName = `${prefix}EmailSubject` as const;
  const bodyName = `${prefix}EmailBody` as const;
  const idPrefix = `collection-notice-${prefix}`;
  const [sms, subject, body] = useWatch({
    control: form.control,
    name: [smsName, subjectName, bodyName],
  });
  const smsPreview = fillTemplate(sms.trim(), SAMPLE);

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-medium">{title}</h3>

      <Field data-invalid={!!errors[smsName]}>
        <FieldLabel htmlFor={`${idPrefix}-sms`}>SMS</FieldLabel>
        <Textarea
          id={`${idPrefix}-sms`}
          rows={3}
          aria-invalid={!!errors[smsName]}
          {...form.register(smsName)}
        />
        <Placeholders />
        <FieldError errors={[errors[smsName]]} />
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">
            Örnek · {smsPreview.length} / {SMS_MAX_LENGTH} karakter
          </div>
          {smsPreview}
        </div>
      </Field>

      <Field data-invalid={!!errors[subjectName]}>
        <FieldLabel htmlFor={`${idPrefix}-subject`}>E-posta Konusu</FieldLabel>
        <Input
          id={`${idPrefix}-subject`}
          aria-invalid={!!errors[subjectName]}
          {...form.register(subjectName)}
        />
        <FieldError errors={[errors[subjectName]]} />
      </Field>

      <Field data-invalid={!!errors[bodyName]}>
        <FieldLabel htmlFor={`${idPrefix}-body`}>E-posta Metni</FieldLabel>
        <Textarea
          id={`${idPrefix}-body`}
          rows={7}
          aria-invalid={!!errors[bodyName]}
          {...form.register(bodyName)}
        />
        <FieldError errors={[errors[bodyName]]} />
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Örnek · e-posta</div>
          <div className="font-medium">
            {fillTemplate(subject.trim(), SAMPLE)}
          </div>
          <div className="mt-2 whitespace-pre-wrap">
            {fillTemplate(body.trim(), SAMPLE)}
          </div>
        </div>
      </Field>
    </section>
  );
}

function Placeholders() {
  return (
    <FieldDescription>
      {Object.entries(COLLECTION_NOTICE_PLACEHOLDERS).map(([key, text], i) => (
        <span key={key}>
          {i > 0 && " · "}
          <code>{`{${key}}`}</code> {text}
        </span>
      ))}
    </FieldDescription>
  );
}
