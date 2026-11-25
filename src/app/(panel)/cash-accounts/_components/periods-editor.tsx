"use client";

import { Plus, X } from "lucide-react";
import {
  type Control,
  Controller,
  useFieldArray,
  useFormState,
} from "react-hook-form";
import { AmountInput } from "@/components/amount-input";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError } from "@/components/ui/field";
import type { CashAccountFormInput } from "@/lib/zod-schemas/cash-account";

// Başlangıç Tarihi | Başlangıç Bakiyesi | remove
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-start gap-x-3";

/**
 * The Dönemler rows of the Kasa - Banka form: each period's start date and
 * Başlangıç Bakiyesi. At least one row stays; rows keep their saved `id`,
 * so a devir into a period survives editing it.
 */
export function PeriodsEditor({
  control,
}: {
  control: Control<CashAccountFormInput>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "periods",
  });
  const { errors } = useFormState({ control, name: "periods" });
  // "En az bir dönem olmalı" sits on the array itself
  const listError = errors.periods?.root ?? errors.periods;

  return (
    <div className="flex flex-col gap-3">
      <div className={`${COLUMNS} text-sm font-medium`} aria-hidden>
        <span>
          Başlangıç Tarihi <span className="text-destructive">*</span>
        </span>
        <span>Başlangıç Bakiyesi</span>
        <span />
      </div>
      {fields.map((row, index) => (
        <div key={row.id} className={COLUMNS}>
          <Controller
            control={control}
            name={`periods.${index}.startDate`}
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <DatePickerInput
                  id={`periods-${index}-startDate`}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!fieldState.error}
                  allowFuture
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name={`periods.${index}.openingBalance`}
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <AmountInput
                  id={`periods-${index}-openingBalance`}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!fieldState.error}
                  allowNegative
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dönemi kaldır"
            className="text-muted-foreground"
            disabled={fields.length === 1}
            onClick={() => remove(index)}
          >
            <X />
          </Button>
        </div>
      ))}
      {typeof listError?.message === "string" && (
        <FieldError>{listError.message}</FieldError>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => append({ startDate: "", openingBalance: "" })}
      >
        <Plus />
        Dönem ekle
      </Button>
      <p className="text-sm text-muted-foreground">
        Boş bırakılan bakiye 0 olur. Bir dönemin bakiyesi, başlangıç bakiyesine
        o dönemdeki tahsilatlar eklenip ödemeleri çıkarılarak hesaplanır.
      </p>
    </div>
  );
}
