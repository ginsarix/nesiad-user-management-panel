"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ArrayPath,
  type Control,
  Controller,
  type FieldArray,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormGetValues,
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
import {
  emptySpreadHistory,
  recordSpread,
  redoSpread,
  type SpreadField,
  type SpreadHistory,
  undoShortcut,
  undoSpread,
} from "@/lib/spread-history";
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
 * Adet or Tutar typed in one row goes into every row, and Cmd/Ctrl+Z puts
 * every row back (src/lib/spread-history.ts). `setValue` and `getValues`
 * are the form's.
 */
export function PledgesEditor<T extends FieldValues>({
  control,
  setValue,
  getValues,
  current,
}: {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  getValues: UseFormGetValues<T>;
  current: readonly { representativeId: number }[];
}) {
  // not saved: unticked on every page load
  const [applyToAll, setApplyToAll] = useState(false);
  const history = useRef<SpreadHistory>(emptySpreadHistory);
  // the box being typed in while ticked: its step is open until it blurs
  const openStep = useRef<{
    key: string;
    field: SpreadField;
    before: Record<string, string>;
  } | null>(null);
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

  function setRowValue(index: number, field: SpreadField, value: string) {
    setValue(fieldName(index, field), value as PathValue<T, Path<T>>, {
      shouldDirty: true,
      shouldValidate: isSubmitted,
    });
  }

  /** Every row's current value of the field, by row id (read from the form,
   * so a change made in this same event counts) */
  function snapshot(field: SpreadField) {
    const values = (getValues(name as Path<T>) ?? []) as PledgeFormRow[];
    return Object.fromEntries(
      fields.map((row, index) => [row.id, values[index]?.[field] ?? ""]),
    );
  }

  /** Ends the open step, recording it for undo */
  function closeStep() {
    const step = openStep.current;
    if (!step) return;
    openStep.current = null;
    history.current = recordSpread(history.current, {
      field: step.field,
      before: step.before,
      after: snapshot(step.field),
    });
  }

  /**
   * Called before a row's Adet or Tutar changes: while ticked, starts a step
   * for that box (one step until it loses focus)
   */
  function beginStep(index: number, field: SpreadField) {
    if (!applyToAll) return;
    const key = `${fields[index]?.id}:${field}`;
    if (openStep.current?.key === key) return;
    closeStep();
    openStep.current = { key, field, before: snapshot(field) };
  }

  /** Puts the row's new Adet or Tutar into every other row, when ticked */
  function spread(index: number, field: SpreadField, value: string) {
    if (!applyToAll) return;
    fields.forEach((_, other) => {
      if (other !== index) setRowValue(other, field, value);
    });
  }

  /** Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y in an Adet or Tutar box */
  function handleUndoKeys(event: React.KeyboardEvent<HTMLElement>) {
    if (!applyToAll) return;
    const target = event.target as HTMLElement;
    if (!/^pledges-\d+-(quantity|amount)$/.test(target.id)) return;
    const command = undoShortcut(event);
    if (!command) return;
    // the browser's undo would spread a wrong value: only ours, while ticked
    event.preventDefault();
    closeStep();
    const result =
      command === "undo"
        ? undoSpread(history.current)
        : redoSpread(history.current);
    if (!result) return;
    history.current = result.history;
    fields.forEach((row, index) => {
      const value = result.values[row.id];
      if (value !== undefined) setRowValue(index, result.field, value);
    });
  }

  // a reset (İptal, or the details page after Kaydet) gives every row a new
  // id: the history no longer applies
  useEffect(() => {
    const ids = new Set(fields.map((row) => row.id));
    const stale = history.current.past
      .concat(history.current.future)
      .some((step) => !Object.keys(step.before).some((id) => ids.has(id)));
    if (stale) {
      history.current = emptySpreadHistory;
      openStep.current = null;
    }
  }, [fields]);

  return (
    <div className="flex flex-col gap-3" onKeyDownCapture={handleUndoKeys}>
      <Field orientation="horizontal" className="w-fit">
        <Checkbox
          id="pledges-apply-to-all"
          checked={applyToAll}
          onCheckedChange={(checked) => {
            // unticked, each box has the browser's own undo again
            closeStep();
            history.current = emptySpreadHistory;
            setApplyToAll(checked);
          }}
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
                      beginStep(index, "quantity");
                      field.onChange(event);
                      spread(index, "quantity", event.target.value);
                    }}
                    onBlur={() => {
                      field.onBlur();
                      closeStep();
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
                      beginStep(index, "amount");
                      field.onChange(value);
                      spread(index, "amount", value);
                    }}
                    onBlur={() => {
                      field.onBlur();
                      closeStep();
                    }}
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
