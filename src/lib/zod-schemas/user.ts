import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1, "Kullanıcı adı boş olamaz"),
  email: z.email("E-posta geçerli olmalıdır"),
  password: z.string().min(6, "Parola en az 6 harf olmalıdır"),
});

export const updateUserSchema = createUserSchema.partial();
