"use client";

import { useMemo } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type PathValue,
  useController,
  useWatch,
} from "react-hook-form";
import { SearchCombobox } from "@/components/search-combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { districtsOf, PROVINCES } from "@/lib/turkey";

const provinceItems = PROVINCES.map((name, index) => ({
  value: index,
  label: name,
}));

/**
 * Şehir and İlçe pickers bound to two string fields ("" when not picked).
 * İlçe offers only the chosen province's districts and is cleared when the
 * province changes.
 */
export function LocationFields<T extends FieldValues>({
  control,
  cityName,
  districtName,
}: {
  control: Control<T>;
  cityName: Path<T>;
  districtName: Path<T>;
}) {
  const city = useWatch({ control, name: cityName }) as string;
  const districts = districtsOf(city);
  const districtItems = useMemo(
    () => districts.map((name, index) => ({ value: index, label: name })),
    [districts],
  );
  const { field: district } = useController({ control, name: districtName });

  return (
    <>
      <Controller
        control={control}
        name={cityName}
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel htmlFor="city">Şehir</FieldLabel>
            <SearchCombobox
              id="city"
              items={provinceItems}
              value={index(PROVINCES, field.value)}
              onChange={(value) => {
                const next = value === null ? "" : PROVINCES[value];
                if (next !== field.value) {
                  district.onChange("" as PathValue<T, Path<T>>);
                }
                field.onChange(next);
              }}
              onBlur={field.onBlur}
              invalid={!!fieldState.error}
              placeholder="İl seçin"
              noItemsText="İl listesi boş."
              noMatchText="Aramanızla eşleşen il yok."
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name={districtName}
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel htmlFor="district">İlçe</FieldLabel>
            <SearchCombobox
              id="district"
              items={districtItems}
              value={index(districts, field.value)}
              onChange={(value) =>
                field.onChange(value === null ? "" : districts[value])
              }
              onBlur={field.onBlur}
              invalid={!!fieldState.error}
              disabled={!city}
              placeholder={city ? "İlçe seçin" : "Önce il seçin"}
              noItemsText="Bu ilin ilçe listesi boş."
              noMatchText="Aramanızla eşleşen ilçe yok."
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </>
  );
}

function index(names: readonly string[], name: string) {
  const found = names.indexOf(name);
  return found === -1 ? null : found;
}
