"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { z as zod } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import type { LoginCodeSentTo } from "@/lib/login-code";
import { phoneCodeSchema } from "@/lib/zod-schemas/panel-user";
import { AuthCard, AuthNotice } from "../_components/auth-card";

const codeFormSchema = zod.object({ code: phoneCodeSchema });
const RESEND_SECONDS = 60;

const texts: Record<LoginCodeSentTo, { prompt: string; sent: string }> = {
  sms: {
    prompt: "Telefonunuza gönderilen 6 haneli kodu girin.",
    sent: "Kod telefonunuza gönderildi.",
  },
  email: {
    prompt: "E-posta adresinize gönderilen 6 haneli kodu girin.",
    sent: "Kod e-posta adresinize gönderildi.",
  },
};

/** Where send-otp says the code went; the server adds `channel` to the plugin's answer */
export function sentTo(data: unknown): LoginCodeSentTo {
  const channel = (data as { channel?: unknown } | null)?.channel;
  return channel === "sms" ? "sms" : "email";
}

/** The login's second step: the 6-digit code sent after the password was accepted */
export function CodeStep({
  sentTo: firstSentTo,
  onVerified,
  onBack,
  onExpired,
}: {
  /** Where the first code went */
  sentTo: LoginCodeSentTo;
  onVerified: () => void;
  onBack: () => void;
  /** The pending login is gone (10 minutes): back to the password step */
  onExpired: (message: string) => void;
}) {
  const form = useForm({
    resolver: zodResolver(codeFormSchema),
    defaultValues: { code: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const [channel, setChannel] = useState(firstSentTo);
  const [info, setInfo] = useState<string | null>(texts[firstSentTo].sent);
  const [sending, setSending] = useState(false);
  // client-side UX only: the server enforces the real cooldown
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function fail(error: { code?: string; status?: number }) {
    const message = authErrorMessage(error);
    if (error.code === "INVALID_TWO_FACTOR_COOKIE") {
      onExpired(message);
      return;
    }
    setInfo(null);
    form.setError("root", { message });
  }

  async function onSubmit(values: z.infer<typeof codeFormSchema>) {
    form.clearErrors("root");
    const { error } = await authClient.twoFactor.verifyOtp({
      code: values.code,
    });
    if (error) {
      fail(error);
      return;
    }
    onVerified();
  }

  async function send(viaEmail: boolean) {
    form.clearErrors("root");
    setSending(true);
    const { data, error } = viaEmail
      ? await authClient.twoFactor.sendOtp({
          fetchOptions: { query: { channel: "email" } },
        })
      : await authClient.twoFactor.sendOtp();
    setSending(false);
    if (error) {
      fail(error);
      return;
    }
    const to = sentTo(data);
    setChannel(to);
    setInfo(texts[to].sent);
    setSecondsLeft(RESEND_SECONDS);
  }

  const waiting = secondsLeft > 0;
  const countdown = waiting ? ` (${secondsLeft} sn)` : "";

  return (
    <AuthCard
      title="Doğrulama kodu"
      description={`${texts[channel].prompt} Kod 5 dakika geçerlidir.`}
    >
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        {errors.root ? (
          <AuthNotice tone="error">{errors.root.message}</AuthNotice>
        ) : (
          info && <AuthNotice>{info}</AuthNotice>
        )}

        <Field data-invalid={!!errors.code}>
          <FieldLabel htmlFor="code">Kod</FieldLabel>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-invalid={!!errors.code}
            {...form.register("code")}
          />
          <FieldError errors={[errors.code]} />
        </Field>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Doğrulanıyor…" : "Doğrula"}
        </Button>

        <div className="flex flex-col items-start gap-2 text-sm">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={waiting || sending}
            onClick={() => send(false)}
          >
            Yeni kod gönder{countdown}
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={waiting || sending}
            onClick={() => send(true)}
          >
            Kod gelmedi, e-postayla gönder{countdown}
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-muted-foreground"
            onClick={onBack}
          >
            Geri
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
