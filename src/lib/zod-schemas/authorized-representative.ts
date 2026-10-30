import { z } from "zod";
import { optionalIsoDateSchema } from "./shared";

export const createAuthorizedRepresentativeSchema = z.object({
  name: z.string().min(1, "Yetkili adı boş olamaz"),

  dateOfBirth: optionalIsoDateSchema,
});

export const updateAuthorizedRepresentativeSchema =
  createAuthorizedRepresentativeSchema.partial();
