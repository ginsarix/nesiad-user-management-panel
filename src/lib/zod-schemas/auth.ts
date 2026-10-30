import { z } from "zod";

// Matches better-auth's defaults (emailAndPassword.min/maxPasswordLength)
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export const newPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır`,
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir`,
  );

export const loginSchema = z.object({
  email: z.email("Geçerli bir e-posta adresi girin"),
  password: z.string().min(1, "Şifre boş olamaz"),
});

export const forgotPasswordSchema = loginSchema.pick({ email: true });

/** New password + repeat, used by the welcome and reset screens */
export const newPasswordFormSchema = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  });

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifre boş olamaz"),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  });
