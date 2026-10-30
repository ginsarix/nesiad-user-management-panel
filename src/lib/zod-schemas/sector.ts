import { z } from "zod";

export const sectorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Sektör adı boş olamaz")
    .max(100, "Sektör adı en fazla 100 karakter olabilir"),
});

export type SectorFormValues = z.infer<typeof sectorSchema>;
