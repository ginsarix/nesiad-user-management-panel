"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
  getSmsSettings,
  updateSmsSettings,
} from "@/lib/fetches/sms";
import { fillTemplate, TEMPLATE_PLACEHOLDERS } from "@/lib/sms/templates";
import {
  SMS_MAX_LENGTH,
  type SmsSettingsValues,
  smsSettingsSchema,
} from "@/lib/zod-schemas/sms";

export function SmsSettings() {
  const { data, isError } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: () => getSmsSettings(),
  });

  if (isError) {
    return <p className="text-sm text-destructive">Ayarlar yüklenemedi.</p>;
  }
  return data ? <SettingsForm settings={data} /> : null;
}

const SAMPLES = {
  foundingMessage: { ad: "Kapadokya Gıda A.Ş.", yil: "12" },
  birthdayMessage: { ad: "Ayşe Yılmaz", yil: "45" },
} as const;

function SettingsForm({ settings }: { settings: SmsSettingsValues }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { data: contacts } = useQuery({
    queryKey: ["sms-contacts"],
    queryFn: () => getSmsContacts(),
  });

  const form = useForm<SmsSettingsValues>({
    resolver: zodResolver(smsSettingsSchema),
    defaultValues: settings,
  });
  const { errors, isDirty } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: updateSmsSettings,
    onSuccess: async (values) => {
      form.reset(values);
      setSaved(true);
      queryClient.setQueryData(["sms-settings"], values);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["audit-logs"] }),
        // the Otomatik tab shows the messages
        queryClient.invalidateQueries({ queryKey: ["sms-celebrations"] }),
      ]);
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      onChange={() => setSaved(false)}
      className="flex max-w-3xl flex-col gap-5 rounded-lg border bg-card p-4"
      noValidate
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Controller
          control={form.control}
          name="autoEnabled"
          render={({ field }) => (
            <Field orientation="horizontal" className="w-auto sm:pt-7">
              <Checkbox
                id="sms-auto-enabled"
                checked={field.value}
                onCheckedChange={(on) => {
                  field.onChange(on);
                  setSaved(false);
                }}
              />
              <FieldLabel htmlFor="sms-auto-enabled" className="font-normal">
                Otomatik kutlama SMS'leri açık
              </FieldLabel>
            </Field>
          )}
        />

        <Field className="w-36" data-invalid={!!errors.sendTime}>
          <FieldLabel htmlFor="sms-send-time">Gönderim saati</FieldLabel>
          <Input
            id="sms-send-time"
            type="time"
            aria-invalid={!!errors.sendTime}
            {...form.register("sendTime")}
          />
          <FieldError errors={[errors.sendTime]} />
        </Field>

        {contacts?.dryRun && (
          <p className="basis-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Deneme modu açık (SMS_DRY_RUN): otomatik SMS'ler gönderilmiş sayılır
            ama NetGSM'e gitmez. O gün için tekrar gönderilmezler.
          </p>
        )}
        <p className="basis-full text-xs text-muted-foreground">
          Her gün bu saatten sonra (Türkiye saati) o gün kutlaması olanlara
          birer SMS gider. Sunucu o saatte kapalıysa aynı gün içinde telafi
          edilir; ertesi güne kalmaz. Kimseye aynı gün ikinci kez gönderilmez.
        </p>
      </div>

      <TemplateField
        form={form}
        name="foundingMessage"
        label="Kuruluş yıl dönümü mesajı (üyeye)"
      />
      <TemplateField
        form={form}
        name="birthdayMessage"
        label="Doğum günü mesajı (yetkiliye)"
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

function TemplateField({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<SmsSettingsValues>>;
  name: "foundingMessage" | "birthdayMessage";
  label: string;
}) {
  const template = useWatch({ control: form.control, name });
  const error = form.formState.errors[name];
  const preview = fillTemplate(template.trim(), SAMPLES[name]);
  const id = `sms-${name}`;

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={3}
        aria-invalid={!!error}
        {...form.register(name)}
      />
      <FieldDescription>
        {Object.entries(TEMPLATE_PLACEHOLDERS).map(([key, text], i) => (
          <span key={key}>
            {i > 0 && " · "}
            <code>{`{${key}}`}</code> {text}
          </span>
        ))}
      </FieldDescription>
      <FieldError errors={[error]} />
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
        <div className="text-xs text-muted-foreground">
          Örnek · {preview.length} / {SMS_MAX_LENGTH} karakter
        </div>
        {preview}
      </div>
    </Field>
  );
}
