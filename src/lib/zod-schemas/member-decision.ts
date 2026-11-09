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

export const REJECTION_NOTE_MAX = 1000;

/** Kabul Et and Pasif olarak ekle; the accept dialog validates with it too */
export const acceptDecisionSchema = z.object({
  decision: z.enum(["accept", "add_passive"]),
  memberLoginDate: loginDateSchema,
  sectorId: z.number({ error: "Geçersiz sektör" }).int().positive().nullable(),
});

/** POST /api/members/:id/decision (JSON) */
export const memberDecisionSchema = z.discriminatedUnion(
  "decision",
  [
    acceptDecisionSchema,
    z.object({
      decision: z.literal("reject"),
      /** Staff-only reason; blank is stored as null */
      note: z
        .string()
        .trim()
        .max(REJECTION_NOTE_MAX, {
          error: `Ret notu en fazla ${REJECTION_NOTE_MAX} karakter olabilir`,
        })
        .transform((value) => value || null)
        .optional(),
    }),
    z.object({ decision: z.literal("reopen") }),
  ],
  { error: "Geçersiz karar" },
);

export type MemberDecision = z.infer<typeof memberDecisionSchema>;
/** What the client sends; the note may still be blank or untrimmed */
export type MemberDecisionInput = z.input<typeof memberDecisionSchema>;
