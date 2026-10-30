import { z } from "zod";
import { newPasswordSchema } from "./auth";

const nameSchema = z.string().trim().min(1, "Ad soyad boş olamaz");

export const addPanelUserSchema = z.object({
  name: nameSchema,
  email: z.string().trim().pipe(z.email("Geçerli bir e-posta adresi girin")),
  password: newPasswordSchema,
});

export const renamePanelUserSchema = z.object({ name: nameSchema });

export const setPanelUserPasswordSchema = z.object({
  password: newPasswordSchema,
});
