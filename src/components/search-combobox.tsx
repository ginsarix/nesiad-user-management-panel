"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { foldTr } from "@/lib/turkish";

export type SearchComboboxItem = { value: number; label: string };

/**
 * Picks one of `items`, or none. Typing only searches the list (Turkish-
 * aware, so "insaat" finds "İnşaat"); free text is never kept.
 */
export function SearchCombobox({
  id,
  items,
  value,
  onChange,
  onBlur,
  placeholder,
  noItemsText,
  noMatchText,
  invalid,
  disabled,
}: {
  id?: string;
  items: SearchComboboxItem[];
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
  placeholder: string;
  /** Shown when `items` is empty */
  noItemsText: string;
  /** Shown when the search matches nothing */
  noMatchText: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const selected = items.find((item) => item.value === value) ?? null;

  return (
    <Combobox
      items={items}
      disabled={disabled}
      value={selected}
      onValueChange={(item) => onChange(item?.value ?? null)}
      isItemEqualToValue={(item, other) => item.value === other.value}
      filter={(item: SearchComboboxItem, query) =>
        foldTr(item.label).includes(foldTr(query.trim()))
      }
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        showClear={!!selected}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {items.length ? noMatchText : noItemsText}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: SearchComboboxItem) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
