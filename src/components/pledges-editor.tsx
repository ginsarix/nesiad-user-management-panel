"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import {
  type ArrayPath,
  type Control,
  Controller,
  type FieldArray,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormSetValue,
  useFieldArray,
  useFormState,
  useWatch,
} from "react-hook-form";
import { AmountInput } from "@/components/amount-input";
import { SearchCombobox } from "@/components/search-combobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRepresentativeItems } from "@/components/use-representative-items";
import { formatAmount } from "@/lib/money";
import {
  newPledgeRow,
  typedPledgeGrandTotal,
  typedPledgeTotal,
} from "@/lib/pledges";
import type { PledgeFormRow } from "@/lib/zod-schemas/project";

const emptyRows: PledgeFormRow[] = [];

// Yetkili | Adet | Tutar | Toplam | remove
const COLUMNS =
  "sm:grid-cols-[minmax(0,1fr)_5.5rem_9.5rem_9rem_2.25rem] sm:gap-x-3";

/**
 * The Taahhütler rows of a form holding `pledges`: Yetkili, Adet, Tutar and
 * the Toplam of each row, with the Genel Toplam under them, all updated as
 * the user types. `current` are the saved rows: their Pasif yetkililer
 * stay pickable. While "Adet ve tutarı tüm satırlara uygula" is ticked, an
 * Adet or Tutar typed in one row goes into every row (`setValue` is the
 * form's).
 */
export function PledgesEditor<T extends FieldValues>({
  control,
  setValue,
  current,
}: {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  current: readonly { representativeId: number }[];
}) {
  // not saved: unticked on every page load
  const [applyToAll, setApplyToAll] = useState(false);
  // after a Kaydet, inputs re-check as they change; spread values do too
  const { isSubmitted } = useFormState({ control });
  const name = "pledges" as ArrayPath<T>;
  const { fields, append, remove } = useFieldArray({ control, name });
  const rows =
    (useWatch({ control, name: name as Path<T> }) as
      | PledgeFormRow[]
      | undefined) ?? emptyRows;

  const representativeItems = useRepresentativeItems(current);

  const fieldName = (index: number, field: keyof PledgeFormRow) =>
    `pledges.${index}.${field}` as Path<T>;

  /** Puts the row's new Adet or Tutar into every other row, when ticked */
  function spread(index: number, field: "quantity" | "amount", value: string) {
    if (!applyToAll) return;
    rows.forEach((_, other) => {
      if (other === index) return;
      setValue(fieldName(other, field), value as PathValue<T, Path<T>>, {
        shouldDirty: true,
        shouldValidate: isSubmitted,
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field orientation="horizontal" className="w-fit">
        <Checkbox
          id="pledges-apply-to-all"
          checked={applyToAll}
          onCheckedChange={setApplyToAll}
        />
        <FieldLabel htmlFor="pledges-apply-to-all" className="font-normal">
          Adet ve tutarı tüm satırlara uygula
        </FieldLabel>
      </Field>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Henüz taahhüt eklenmemiş.
        </p>
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
        const total = rows[index] ? typedPledgeTotal(rows[index]) : null;
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
                    id={`pledges-${index}-representative`}
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
                    id={`pledges-${index}-quantity`}
                    aria-label="Adet"
                    placeholder="Adet"
                    inputMode="numeric"
                    autoComplete="off"
                    className="text-right tabular-nums"
                    aria-invalid={!!fieldState.error}
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      spread(index, "quantity", event.target.value);
                    }}
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
                    id={`pledges-${index}-amount`}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      spread(index, "amount", value);
                    }}
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
              aria-label="Taahhüdü kaldır"
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
            {formatAmount(typedPledgeGrandTotal(rows))}
          </span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() =>
          append(newPledgeRow(rows, applyToAll) as FieldArray<T, ArrayPath<T>>)
        }
      >
        <Plus />
        Taahhüt ekle
      </Button>
    </div>
  );
}
