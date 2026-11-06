"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SearchCombobox } from "@/components/search-combobox";
import { getSectors, type Sector } from "@/lib/fetches/sector";

const emptySectors: Sector[] = [];

/** One of the sectors from the Ayarlar page, or none */
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
    () => sectors.map((s) => ({ value: s.id, label: s.name })),
    [sectors],
  );

  return (
    <SearchCombobox
      id={id}
      items={items}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder="Sektör seçin"
      noItemsText="Henüz sektör eklenmemiş."
      noMatchText="Aramanızla eşleşen sektör yok."
    />
  );
}
