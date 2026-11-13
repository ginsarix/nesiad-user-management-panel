"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  type Control,
  Controller,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import { AmountInput } from "@/components/amount-input";
import { SearchCombobox } from "@/components/search-combobox";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { useRepresentativeItems } from "@/components/use-representative-items";
import { typedAccrualTotal } from "@/lib/accruals";
import { getParameters } from "@/lib/fetches/parameter";
import { formatAmount } from "@/lib/money";
import type {
  AccrualFormInput,
  AccrualFormRow,
  AccrualFormValues,
} from "@/lib/zod-schemas/accrual";

const emptyRows: AccrualFormRow[] = [];

const NEW_ROW: AccrualFormRow = {
  representativeId: null,
  categoryId: null,
  amount: "",
};

// Yetkili | Aidat | Tutar | remove
const COLUMNS =
  "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_2.25rem] sm:gap-x-3";

/**
 * The Tahakkuk rows: Yetkili, Aidat (a Tahsilat Türü) and Tutar, with the
 * Genel Toplam of the Tutar under them, updated as the user types.
 * `current` are the saved rows: their Pasif yetkililer stay pickable.
 */
export function AccrualRowsEditor({
  control,
  current,
}: {
  control: Control<AccrualFormInput, unknown, AccrualFormValues>;
  current: readonly { representativeId: number }[];
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "rows" });
  const rows = useWatch({ control, name: "rows" }) ?? emptyRows;

  const representativeItems = useRepresentativeItems(current);
  const { data: parameters, isSuccess: parametersLoaded } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });
  // Aidat is picked from the Tahsilat Türü list
  const aidatItems = useMemo(
    () =>
      (parameters ?? [])
        .filter((p) => p.kind === "collection_category")
        .map((p) => ({ value: p.id, label: p.name })),
    [parameters],
  );

  return (
    <div className="flex flex-col gap-3">
      {parametersLoaded && aidatItems.length === 0 && (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          Tahakkuk eklemek için önce{" "}
          <Link href="/settings" className="font-medium underline">
            Ayarlar → Parametreler
          </Link>
          'de tahsilat türü ekleyin.
        </p>
      )}

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Henüz tahakkuk eklenmemiş.
        </p>
      ) : (
        <div
          className={`hidden text-sm font-medium sm:grid ${COLUMNS}`}
          aria-hidden
        >
          <span>Yetkili</span>
          <span>Aidat</span>
          <span>Tutar</span>
          <span />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className={`grid grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-x-3 gap-y-2 border-b pb-3 last:border-b-0 last:pb-0 sm:border-b-0 sm:pb-0 ${COLUMNS}`}
          >
            <Controller
              control={control}
              name={`rows.${index}.representativeId`}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={!!fieldState.error}
                  className="col-span-2 sm:col-span-1"
                >
                  <SearchCombobox
                    id={`rows-${index}-representative`}
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
              name={`rows.${index}.categoryId`}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={!!fieldState.error}
                  className="col-span-2 sm:col-span-1"
                >
                  <SearchCombobox
                    id={`rows-${index}-category`}
                    items={aidatItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Aidat seçin"
                    noItemsText="Ayarlar'da tahsilat türü yok."
                    noMatchText="Aramanızla eşleşen aidat yok."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name={`rows.${index}.amount`}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <AmountInput
                    id={`rows-${index}-amount`}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!fieldState.error}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Tahakkuku kaldır"
              className="justify-self-end text-muted-foreground"
              onClick={() => remove(index)}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>

      {fields.length > 0 && (
        <div
          className={`flex items-center justify-between border-t pt-3 text-sm font-medium sm:grid ${COLUMNS}`}
        >
          <span className="sm:col-span-2">Genel Toplam</span>
          <span className="tabular-nums sm:pr-3 sm:text-right">
            {formatAmount(typedAccrualTotal(rows))}
          </span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => append(NEW_ROW)}
      >
        <Plus />
        Tahakkuk ekle
      </Button>
    </div>
  );
}
