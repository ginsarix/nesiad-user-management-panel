import { z } from "zod";

export const createAuthorizedRepresentativeSchema = z.object({
  name: z.string().min(1, "Yetkili adı boş olamaz"),

  dateOfBirth: z.string().optional(),
});

export const updateAuthorizedRepresentativeSchema =
  createAuthorizedRepresentativeSchema.partial();
