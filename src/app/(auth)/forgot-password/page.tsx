"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { forgotPasswordSchema } from "@/lib/zod-schemas/auth";
import { AuthCard, AuthNotice } from "../_components/auth-card";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ email }: z.infer<typeof forgotPasswordSchema>) {
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
      return;
    }
    setSent(true);
  }

  return (
    <AuthCard
      title="Şifremi unuttum"
      description="E-posta adresinizi girin, şifrenizi yenilemeniz için bir bağlantı gönderelim."
    >
      {sent ? (
        // Same message whether or not the address has an account
        <AuthNotice>
          Bu adres kayıtlıysa bir bağlantı gönderdik. E-postanızı kontrol edin.
        </AuthNotice>
      ) : (
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          {errors.root && (
            <AuthNotice tone="error">{errors.root.message}</AuthNotice>
          )}
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">E-posta</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Gönderiliyor…" : "Bağlantı gönder"}
          </Button>
        </form>
      )}
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Girişe dön
      </Link>
    </AuthCard>
  );
}
