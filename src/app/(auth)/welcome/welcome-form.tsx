"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { newPasswordFormSchema } from "@/lib/zod-schemas/auth";
import { AuthCard, AuthNotice } from "../_components/auth-card";
import { NewPasswordFields } from "../_components/password-fields";

export function WelcomeForm({ name }: { name: string }) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(newPasswordFormSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({
    newPassword,
  }: z.infer<typeof newPasswordFormSchema>) {
    const { error } = await authClient.initialPassword.set({ newPassword });
    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
      return;
    }
    router.replace("/members");
  }

  return (
    <AuthCard
      title={`Hoş geldiniz, ${name}`}
      description="E-postanız doğrulandı. Size mesajla iletilen şifreyi isterseniz şimdi değiştirebilirsiniz."
    >
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        {errors.root && (
          <AuthNotice tone="error">{errors.root.message}</AuthNotice>
        )}
        <NewPasswordFields register={form.register} errors={errors} />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Kaydediliyor…" : "Şifreyi kaydet"}
        </Button>
        <Link href="/members" className={buttonVariants({ variant: "ghost" })}>
          Şimdi değil
        </Link>
      </form>
    </AuthCard>
  );
}
