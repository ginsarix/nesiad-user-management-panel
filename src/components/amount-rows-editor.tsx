"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useMemo } from "react";
import {
  type ArrayPath,
  type Control,
  Controller,
  type FieldArray,
  type FieldValues,
  type Path,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import { AmountInput } from "@/components/amount-input";
import { SearchCombobox } from "@/components/search-combobox";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { typedGrandTotal, typedRowTotal } from "@/lib/amount-rows";
import {
  getRepresentatives,
  type RepresentativeListItem,
} from "@/lib/fetches/representative";
import { formatAmount } from "@/lib/money";
import { compareTr } from "@/lib/turkish";
import type { AmountRowFormRow } from "@/lib/zod-schemas/amount-rows";

const emptyRepresentatives: RepresentativeListItem[] = [];
const emptyRows: AmountRowFormRow[] = [];

const NEW_ROW: AmountRowFormRow = {
  representativeId: null,
  quantity: "1",
  amount: "",
};

// Yetkili | Adet | Tutar | Toplam | remove
const COLUMNS =
  "sm:grid-cols-[minmax(0,1fr)_5.5rem_9.5rem_9rem_2.25rem] sm:gap-x-3";

/** What the rows are, in the editor's texts */
export type AmountRowsLabels = {
  /** "Henüz taahhüt eklenmemiş." */
  empty: string;
  /** "Taahhüt ekle" */
  add: string;
  /** "Taahhüdü kaldır" */
  remove: string;
};

/**
 * Rows of a form's array field `name` (Taahhütler, Tahakkuk): Yetkili,
 * Adet, Tutar and the Toplam of each row, with the Genel Toplam under them,
 * all updated as the user types. `current` are the saved rows: their Pasif
 * yetkililer stay pickable.
 */
export function AmountRowsEditor<T extends FieldValues>({
  control,
  name: fieldArrayName,
  current,
  labels,
}: {
  control: Control<T>;
  name: "pledges" | "rows";
  current: readonly { representativeId: number }[];
  labels: AmountRowsLabels;
}) {
  const name = fieldArrayName as ArrayPath<T>;
  const { fields, append, remove } = useFieldArray({ control, name });
  const rows =
    (useWatch({ control, name: name as Path<T> }) as
      | AmountRowFormRow[]
      | undefined) ?? emptyRows;

  const { data: representatives = emptyRepresentatives } = useQuery({
    queryKey: ["representatives"],
    queryFn: () => getRepresentatives(),
  });

  // Aktif yetkililer, plus Pasif ones already saved here: they stay
  const representativeItems = useMemo(() => {
    const currentIds = new Set(current.map((p) => p.representativeId));
    return representatives
      .filter((r) => r.active || currentIds.has(r.id))
      .map((r) => ({
        value: r.id,
        label: r.active ? r.name : `${r.name} (Pasif)`,
      }))
      .toSorted((a, b) => compareTr(a.label, b.label));
  }, [representatives, current]);

  const fieldName = (index: number, field: keyof AmountRowFormRow) =>
    `${fieldArrayName}.${index}.${field}` as Path<T>;

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div
          className={`hidden text-sm font-medium sm:grid ${COLUMNS}`}
          aria-hidden
        >
          <span>Yetkili</span>
          <span>Adet</span>
          <span>Tutar</span>
          <span className="text-right">Toplam</span>
          <span />
        </div>
      )}

      {fields.map((field, index) => {
        const total = rows[index] ? typedRowTotal(rows[index]) : null;
        return (
          <div
            key={field.id}
            className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 border-b pb-3 last-of-type:border-b-0 sm:border-b-0 sm:pb-0 ${COLUMNS}`}
          >
            <Controller
              control={control}
              name={fieldName(index, "representativeId")}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={!!fieldState.error}
                  className="col-span-2 sm:col-span-1"
                >
                  <SearchCombobox
                    id={`${fieldArrayName}-${index}-representative`}
                    items={representativeItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Yetkili seçin"
                    noItemsText="Seçilebilecek yetkili yok."
                    noMatchText="Aramanızla eşleşen yetkili yok."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name={fieldName(index, "quantity")}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <Input
                    id={`${fieldArrayName}-${index}-quantity`}
                    aria-label="Adet"
                    placeholder="Adet"
                    inputMode="numeric"
                    autoComplete="off"
                    className="text-right tabular-nums"
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name={fieldName(index, "amount")}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <AmountInput
                    id={`${fieldArrayName}-${index}-amount`}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!fieldState.error}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <p className="flex h-9 items-center gap-1.5 text-sm tabular-nums sm:justify-end">
              <span className="text-muted-foreground sm:hidden">Toplam:</span>
              {total === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                formatAmount(total)
              )}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.remove}
              className="justify-self-end text-muted-foreground"
              onClick={() => remove(index)}
            >
              <X />
            </Button>
          </div>
        );
      })}

      {fields.length > 0 && (
        <div
          className={`flex items-center justify-between border-t pt-3 text-sm font-medium sm:grid ${COLUMNS}`}
        >
          <span className="sm:col-span-3">Genel Toplam</span>
          <span className="tabular-nums sm:text-right">
            {formatAmount(typedGrandTotal(rows))}
          </span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => append(NEW_ROW as FieldArray<T, ArrayPath<T>>)}
      >
        <Plus />
        {labels.add}
      </Button>
    </div>
  );
}
