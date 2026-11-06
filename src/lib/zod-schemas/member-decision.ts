import { z } from "zod";
import { isFutureDate, parseIsoDate } from "../dates";
import { FUTURE_DATE_MESSAGE, INVALID_DATE_MESSAGE } from "./shared";

/** Required, yyyy-aa-gg, today or earlier */
const loginDateSchema = z
  .string({ error: "Üye Giriş Tarihi gerekli" })
  .trim()
  .superRefine((value, ctx) => {
    const date = parseIsoDate(value);
    if (!date) ctx.addIssue({ code: "custom", message: INVALID_DATE_MESSAGE });
    else if (isFutureDate(date)) {
      ctx.addIssue({ code: "custom", message: FUTURE_DATE_MESSAGE });
    }
  });

/** POST /api/members/:id/decision (JSON) */
export const memberDecisionSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({
      decision: z.enum(["accept", "add_passive"]),
      memberLoginDate: loginDateSchema,
      sectorId: z
        .number({ error: "Geçersiz sektör" })
        .int()
        .positive()
        .nullable(),
    }),
    z.object({ decision: z.enum(["reject", "reopen"]) }),
  ],
  { error: "Geçersiz karar" },
);

export type MemberDecision = z.infer<typeof memberDecisionSchema>;
