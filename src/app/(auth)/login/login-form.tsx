"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { loginSchema } from "@/lib/zod-schemas/auth";
import { AuthCard, AuthNotice } from "../_components/auth-card";

const notices = {
  reset: "Şifreniz yenilendi. Yeni şifrenizle giriş yapabilirsiniz.",
  verification:
    "Doğrulama bağlantısının süresi dolmuş ya da daha önce kullanılmış. Giriş yapmayı deneyin, size yeni bir bağlantı gönderilir.",
};

export function LoginForm({
  next,
  notice,
}: {
  next: string;
  notice?: keyof typeof notices;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    // No callbackURL: better-auth would also redirect a successful login there
    const { error } = await authClient.signIn.email(values);
    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <AuthCard title="Panele giriş">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        {errors.root ? (
          <AuthNotice tone="error">{errors.root.message}</AuthNotice>
        ) : (
          notice && <AuthNotice>{notices[notice]}</AuthNotice>
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
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Şifre</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        <Link
          href="/forgot-password"
          className="self-end text-sm text-primary hover:underline"
        >
          Şifremi unuttum
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
    </AuthCard>
  );
}
