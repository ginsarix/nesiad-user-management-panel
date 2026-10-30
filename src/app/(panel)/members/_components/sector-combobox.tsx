"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { getSectors, type Sector } from "@/lib/fetches/sector";
import { foldTr } from "@/lib/turkish";

type SectorItem = { value: number; label: string };

const emptySectors: Sector[] = [];

/**
 * One of the sectors from the Sektörler page, or none. Typing only
 * searches the list; it can't add a new sector.
 */
export function SectorCombobox({
  id,
  value,
  onChange,
  onBlur,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
}) {
  const { data: sectors = emptySectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => getSectors(),
  });
  const items = useMemo(
    () => sectors.map((s): SectorItem => ({ value: s.id, label: s.name })),
    [sectors],
  );
  const selected = items.find((item) => item.value === value) ?? null;

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(item) => onChange(item?.value ?? null)}
      isItemEqualToValue={(item, other) => item.value === other.value}
      // same matching as the member search: "insaat" finds "İnşaat"
      filter={(item: SectorItem, query) =>
        foldTr(item.label).includes(foldTr(query.trim()))
      }
    >
      <ComboboxInput
        id={id}
        placeholder="Sektör seçin"
        showClear={!!selected}
        onBlur={onBlur}
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {items.length
            ? "Aramanızla eşleşen sektör yok."
            : "Henüz sektör eklenmemiş."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: SectorItem) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
