import { z } from "zod";
import { normalizePhone } from "../sms/phone";
import { newPasswordSchema } from "./auth";

const nameSchema = z.string().trim().min(1, "Ad soyad boş olamaz");

/** A mobile number in any common format, as the stored "5XXXXXXXXX" */
export const panelUserPhoneSchema = z.string().transform((raw, ctx) => {
  const result = normalizePhone(raw);
  if (result.ok) return result.phone;
  ctx.addIssue({
    code: "custom",
    message:
      result.reason === "landline"
        ? "Cep telefonu numarası girin"
        : "Geçerli bir cep telefonu numarası girin",
  });
  return z.NEVER;
});

/** The SMS code as typed; spaces ("123 456") are dropped */
export const phoneCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "6 haneli kodu girin"));

export const addPanelUserSchema = z.object({
  name: nameSchema,
  email: z.string().trim().pipe(z.email("Geçerli bir e-posta adresi girin")),
  password: newPasswordSchema,
  phone: panelUserPhoneSchema,
  code: phoneCodeSchema,
});

export const changePanelUserPhoneSchema = z.object({
  phone: panelUserPhoneSchema,
  code: phoneCodeSchema,
});

/** Who the code is for: an existing user, or one being created (no id) */
export const phoneCodeRequestSchema = z.object({
  phone: panelUserPhoneSchema,
  userId: z.string().min(1).optional(),
});

export const renamePanelUserSchema = z.object({ name: nameSchema });

export const setPanelUserPasswordSchema = z.object({
  password: newPasswordSchema,
});
