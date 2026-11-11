import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  getSmsContacts,
  getSmsSettings,
  updateSmsSettings,
} from "@/lib/fetches/sms";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/sms/templates";
import {
  type SmsSettingsValues,
  smsSettingsSchema,
} from "@/lib/zod-schemas/sms";
import { SaveRow, SmsTemplateRow } from "./template-forms";

export function SmsSettings({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { data, isError } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: () => getSmsSettings(),
  });

  if (isError) {
    return <p className="text-sm text-destructive">Ayarlar yüklenemedi.</p>;
  }
  return data ? (
    <SettingsForm settings={data} onDirtyChange={onDirtyChange} />
  ) : null;
}

const SAMPLES = {
  foundingMessage: { ad: "Kapadokya Gıda A.Ş.", yil: "12" },
  birthdayMessage: { ad: "Ayşe Yılmaz", yil: "45" },
} as const;

function SettingsForm({
  settings,
  onDirtyChange,
}: {
  settings: SmsSettingsValues;
  onDirtyChange?: (dirty: boolean) => void;
}) {
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
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

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
      className="flex flex-col divide-y rounded-lg border bg-card px-4"
      noValidate
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 py-5">
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
      </div>

      <CelebrationTemplate
        form={form}
        name="foundingMessage"
        label="Kuruluş yıl dönümü mesajı (üyeye)"
      />
      <CelebrationTemplate
        form={form}
        name="birthdayMessage"
        label="Doğum günü mesajı (yetkiliye)"
      />

      <div className="py-4">
        <SaveRow
          isDirty={isDirty}
          isPending={isPending}
          saved={saved}
          error={error}
        />
      </div>
    </form>
  );
}

function CelebrationTemplate({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<SmsSettingsValues>>;
  name: "foundingMessage" | "birthdayMessage";
  label: string;
}) {
  const value = useWatch({ control: form.control, name });
  return (
    <SmsTemplateRow
      id={`sms-${name}`}
      label={label}
      registration={form.register(name)}
      setValue={(next) =>
        form.setValue(name, next, {
          shouldDirty: true,
          shouldValidate: form.formState.isSubmitted,
        })
      }
      value={value}
      error={form.formState.errors[name]}
      placeholders={TEMPLATE_PLACEHOLDERS}
      sample={SAMPLES[name]}
    />
  );
}
