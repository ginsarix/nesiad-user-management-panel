import { z } from "zod";

export const safeNumSchema = <T extends z.ZodType = z.ZodNumber>(
  someType: T = z.number() as unknown as T,
) =>
  z.preprocess((val) => {
    if (typeof val === "number") return val;
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed === "" ? undefined : Number(trimmed);
    }
    return undefined;
  }, someType);
