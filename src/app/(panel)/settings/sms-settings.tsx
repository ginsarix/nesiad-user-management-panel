import { Controller, type UseFormReturn, useWatch } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/sms/templates";
import type { SmsSettingsValues } from "@/lib/zod-schemas/sms";
import { SmsTemplateRow } from "./template-forms";

const SAMPLES = {
  foundingMessage: { ad: "Kapadokya Gıda A.Ş.", yil: "12" },
  birthdayMessage: { ad: "Ayşe Yılmaz", yil: "45" },
} as const;

/** Automatic celebration SMS: on/off, send time and the two messages */
export function CelebrationFields({
  form,
  dryRun,
}: {
  form: UseFormReturn<SmsSettingsValues>;
  dryRun: boolean;
}) {
  const { errors } = form.formState;

  return (
    <div className="flex flex-col divide-y rounded-lg border bg-card px-4">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 py-5">
        <Controller
          control={form.control}
          name="autoEnabled"
          render={({ field }) => (
            <Field orientation="horizontal" className="w-auto sm:pt-7">
              <Checkbox
                id="sms-auto-enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
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

        {dryRun && (
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
    </div>
  );
}

function CelebrationTemplate({
  form,
  name,
  label,
}: {
  form: UseFormReturn<SmsSettingsValues>;
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
