import { z } from "zod";
import { displayToIso, parseDisplayDate, parseIsoDate } from "../dates";
import { parseSignedAmountInput, SIGNED_AMOUNT_PATTERN } from "../money";
import { INVALID_DATE_MESSAGE, REQUIRED_DATE_MESSAGE } from "./shared";

const INVALID_AMOUNT = "Geçerli bir tutar girin";
export const NO_PERIODS_MESSAGE = "En az bir dönem olmalı";
export const DUPLICATE_PERIOD_MESSAGE =
  "Aynı başlangıç tarihli iki dönem olamaz";

const nameSchema = z
  .string()
  .trim()
  .min(1, "İsim boş olamaz")
  .max(200, "İsim en fazla 200 karakter olabilir");

/** A required date in the given format; unlike records', it may be in the future */
function anyDate(parseDate: (text: string) => Date | null) {
  return z
    .string()
    .trim()
    .min(1, REQUIRED_DATE_MESSAGE)
    .refine((text) => parseDate(text) !== null, INVALID_DATE_MESSAGE);
}

/** Flags every period after the first that repeats a start date */
function refineDistinctStarts(
  periods: readonly { startDate: string }[],
  ctx: z.RefinementCtx,
  key: (startDate: string) => string,
) {
  const seen = new Set<string>();
  periods.forEach((period, index) => {
    const start = key(period.startDate);
    if (!start) return;
    if (seen.has(start)) {
      ctx.addIssue({
        code: "custom",
        message: DUPLICATE_PERIOD_MESSAGE,
        path: [index, "startDate"],
      });
    }
    seen.add(start);
  });
}

/** A period as the API takes it; `id` when it's an existing one (PATCH) */
export const cashAccountPeriodApiSchema = z.object({
  id: z.number().int().positive().optional(),
  startDate: anyDate(parseIsoDate),
  openingBalance: z
    .string({ error: INVALID_AMOUNT })
    .regex(SIGNED_AMOUNT_PATTERN, INVALID_AMOUNT),
});

const periodsApiSchema = z
  .array(cashAccountPeriodApiSchema)
  .min(1, NO_PERIODS_MESSAGE)
  .superRefine((periods, ctx) =>
    refineDistinctStarts(periods, ctx, (start) => start),
  );

/** POST /api/cash-accounts */
export const cashAccountCreateSchema = z.object({
  name: nameSchema,
  active: z.boolean(),
  periods: periodsApiSchema,
});

/** PATCH /api/cash-accounts/:id; without `periods` they're left alone */
export const cashAccountUpdateSchema = z.object({
  name: nameSchema,
  active: z.boolean(),
  periods: periodsApiSchema.optional(),
});

/** POST /api/cash-accounts/:id/carry-over */
export const carryOverSchema = z.object({
  fromPeriodId: z.number().int().positive(),
  toPeriodId: z.number().int().positive(),
});

export type CashAccountCreateValues = z.input<typeof cashAccountCreateSchema>;
export type CashAccountUpdateValues = z.input<typeof cashAccountUpdateSchema>;
export type CarryOverValues = z.input<typeof carryOverSchema>;

/** A Dönemler row as typed: gg.aa.yyyy, a Turkish amount that may be empty */
const periodFormSchema = z.object({
  id: z.number().optional(),
  startDate: anyDate(parseDisplayDate),
  openingBalance: z
    .string()
    .trim()
    .refine(
      (text) => text === "" || parseSignedAmountInput(text) !== null,
      INVALID_AMOUNT,
    ),
});

/** The Kasa - Banka form */
export const cashAccountFormSchema = z.object({
  name: nameSchema,
  active: z.boolean(),
  periods: z
    .array(periodFormSchema)
    .min(1, NO_PERIODS_MESSAGE)
    .superRefine((periods, ctx) =>
      refineDistinctStarts(periods, ctx, (start) => displayToIso(start)),
    ),
});

export type CashAccountFormInput = z.input<typeof cashAccountFormSchema>;
export type CashAccountFormValues = z.output<typeof cashAccountFormSchema>;
export type PeriodFormRow = CashAccountFormInput["periods"][number];

/**
 * Valid form values → what the API takes; an empty balance is 0. Periods go
 * only when they were edited (always on create): an edit form opened before
 * a Devir still holds the old Başlangıç Bakiyesi, and sending it back with a
 * rename would undo the devir.
 */
export function cashAccountToApi(
  values: CashAccountFormValues,
  { periodsEdited }: { periodsEdited: boolean },
): CashAccountUpdateValues {
  const { name, active } = values;
  if (!periodsEdited) return { name, active };
  return {
    name,
    active,
    periods: values.periods.map((period) => ({
      ...(period.id !== undefined && { id: period.id }),
      startDate: displayToIso(period.startDate),
      // the schema has checked it parses
      openingBalance:
        period.openingBalance === ""
          ? "0.00"
          : (parseSignedAmountInput(period.openingBalance) as string),
    })),
  };
}
