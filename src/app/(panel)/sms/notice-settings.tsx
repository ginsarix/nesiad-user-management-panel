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
import type { NoticeKind } from "@/lib/application-notices";
import { getNoticeSettings, updateNoticeSettings } from "@/lib/fetches/sms";
import { fillTemplate, NOTICE_PLACEHOLDERS } from "@/lib/sms/templates";
import {
  type NoticeSettingsValues,
  noticeSettingsSchema,
} from "@/lib/zod-schemas/application-notices";
import { SMS_MAX_LENGTH } from "@/lib/zod-schemas/sms";

const SAMPLE = { ad: "Ayşe Yılmaz", firma: "Kapadokya Gıda A.Ş." };

type NoticeFormApi = ReturnType<typeof useForm<NoticeSettingsValues>>;

export function NoticeSettings() {
  const { data, isError } = useQuery({
    queryKey: ["notice-settings"],
    queryFn: () => getNoticeSettings(),
  });

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Bildirim şablonları yüklenemedi.
      </p>
    );
  }
  return data ? <NoticeSettingsForm settings={data} /> : null;
}

function NoticeSettingsForm({ settings }: { settings: NoticeSettingsValues }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const form = useForm<NoticeSettingsValues>({
    resolver: zodResolver(noticeSettingsSchema),
    defaultValues: settings,
  });
  const { isDirty } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: updateNoticeSettings,
    onSuccess: async (values) => {
      form.reset(values);
      setSaved(true);
      queryClient.setQueryData(["notice-settings"], values);
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
      <p className="text-xs text-muted-foreground">
        Üyelik formundan bir başvuru gelince, başvuru kabul edilince ya da
        reddedilince başvurana hem SMS hem e-posta gider. Otomatik kutlama
        SMS'lerinin açık ya da kapalı olması bunları etkilemez.
      </p>

      <Notice
        form={form}
        title="Başvuru Alındı Bildirimi"
        prefix="received"
        idPrefix="notice-received"
      />
      <Notice
        form={form}
        title="Başvuru Kabul Bildirimi"
        prefix="accepted"
        idPrefix="notice-accepted"
      />
      <Notice
        form={form}
        title="Başvuru Red Bildirimi"
        prefix="rejected"
        idPrefix="notice-rejected"
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
  idPrefix,
}: {
  form: NoticeFormApi;
  title: string;
  prefix: NoticeKind;
  idPrefix: string;
}) {
  const { errors } = form.formState;
  const smsName = `${prefix}Sms` as const;
  const subjectName = `${prefix}EmailSubject` as const;
  const bodyName = `${prefix}EmailBody` as const;
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
      {Object.entries(NOTICE_PLACEHOLDERS).map(([key, text], i) => (
        <span key={key}>
          {i > 0 && " · "}
          <code>{`{${key}}`}</code> {text}
        </span>
      ))}
    </FieldDescription>
  );
}
