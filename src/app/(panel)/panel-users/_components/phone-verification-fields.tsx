"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  type Control,
  type FieldValues,
  type Path,
  useController,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { sendPhoneCode } from "@/lib/fetches/panel-user";
import { panelUserPhoneSchema } from "@/lib/zod-schemas/panel-user";

const COOLDOWN_SECONDS = 60;

/**
 * The phone number, the "Kod gönder" button and the code it texts. The code
 * input only shows for the number a code was sent to.
 */
export function PhoneVerificationFields<T extends FieldValues>({
  control,
  userId,
  idPrefix = "",
}: {
  // must have string "phone" and "code" fields
  // biome-ignore lint/suspicious/noExplicitAny: the output type differs per form
  control: Control<T, any, any>;
  userId?: string;
  idPrefix?: string;
}) {
  const phone = useController({ control, name: "phone" as Path<T> });
  const code = useController({ control, name: "code" as Path<T> });

  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const phoneValue = String(phone.field.value ?? "");
  const codeShown = sentTo !== null && sentTo === phoneValue;

  const send = useMutation({
    mutationFn: async () => {
      const parsed = panelUserPhoneSchema.safeParse(phoneValue);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      await sendPhoneCode({ phone: parsed.data, userId });
    },
    onSuccess: () => {
      setSentTo(phoneValue);
      setCooldown(COOLDOWN_SECONDS);
    },
  });

  return (
    <>
      <Field data-invalid={!!phone.fieldState.error}>
        <FieldLabel htmlFor={`${idPrefix}phone`}>Cep telefonu</FieldLabel>
        <div className="flex items-start gap-2">
          <Input
            id={`${idPrefix}phone`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="0532 123 45 67"
            aria-invalid={!!phone.fieldState.error}
            {...phone.field}
            value={phoneValue}
            onChange={(event) => {
              phone.field.onChange(event);
              // a code belongs to the number it was sent to
              if (sentTo !== null && event.target.value !== sentTo) {
                code.field.onChange("");
              }
              send.reset();
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={send.isPending || cooldown > 0}
            onClick={() => send.mutate()}
          >
            {send.isPending
              ? "Gönderiliyor…"
              : cooldown > 0
                ? `Kod gönder (${cooldown})`
                : "Kod gönder"}
          </Button>
        </div>
        <FieldDescription>
          Kod bu numaraya SMS ile gider. Telefonun sahibinden kodu alıp buraya
          girin.
        </FieldDescription>
        <FieldError errors={[phone.fieldState.error]} />
        {send.isSuccess && codeShown && (
          <output className="text-sm text-muted-foreground">
            Kod gönderildi
          </output>
        )}
        {send.error && <FieldError>{send.error.message}</FieldError>}
      </Field>
      {codeShown && (
        <Field data-invalid={!!code.fieldState.error}>
          <FieldLabel htmlFor={`${idPrefix}code`}>SMS kodu</FieldLabel>
          <Input
            id={`${idPrefix}code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            aria-invalid={!!code.fieldState.error}
            {...code.field}
            value={String(code.field.value ?? "")}
          />
          <FieldError errors={[code.fieldState.error]} />
        </Field>
      )}
    </>
  );
}
