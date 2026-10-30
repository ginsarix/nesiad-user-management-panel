"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { z } from "zod";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  MIN_PASSWORD_LENGTH,
  type newPasswordFormSchema,
} from "@/lib/zod-schemas/auth";

type Values = z.infer<typeof newPasswordFormSchema>;

/** "Yeni şifre" + "Yeni şifre (tekrar)", shared by the welcome and reset screens */
export function NewPasswordFields({
  register,
  errors,
}: {
  register: UseFormRegister<Values>;
  errors: FieldErrors<Values>;
}) {
  return (
    <>
      <Field data-invalid={!!errors.newPassword}>
        <FieldLabel htmlFor="newPassword">Yeni şifre</FieldLabel>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          autoFocus
          placeholder={`En az ${MIN_PASSWORD_LENGTH} karakter`}
          aria-invalid={!!errors.newPassword}
          {...register("newPassword")}
        />
        <FieldError errors={[errors.newPassword]} />
      </Field>
      <Field data-invalid={!!errors.confirmPassword}>
        <FieldLabel htmlFor="confirmPassword">Yeni şifre (tekrar)</FieldLabel>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        <FieldError errors={[errors.confirmPassword]} />
      </Field>
    </>
  );
}
