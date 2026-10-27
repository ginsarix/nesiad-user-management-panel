import { z } from "zod";

export const createMemberSchema = z.object({
  title: z.string().min(1, "Ünvan boş olamaz"),

  authorizedRepresentativeIds: z.array(z.number().int().positive()).optional(),

  memberLoginDate: z.string().optional(),

  logo: z
    .instanceof(File)
    .refine(
      (f) => f.size <= 25 * 1024 * 1024,
      "Dosya 25 MB'dan küçük olmalıdır",
    )
    .refine(
      (f) => f.type.startsWith("image/"),
      "Sadece resim dosyaları kabul edilir",
    )
    .optional(),

  address: z.string().optional(),
  phone: z.string().optional(),
  sector: z.string().optional(),
  foundingDate: z.string().optional(),

  seniorityDate: z.string().optional(),
});

export const updateMemberSchema = createMemberSchema.partial();
