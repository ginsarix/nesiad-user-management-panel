"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SearchComboboxItem } from "@/components/search-combobox";
import {
  getRepresentatives,
  type RepresentativeListItem,
} from "@/lib/fetches/representative";
import { compareTr } from "@/lib/turkish";

const emptyRepresentatives: RepresentativeListItem[] = [];

/**
 * A row editor's yetkili picker (Taahhütler, Tahakkuk): Aktif yetkililer,
 * plus Pasif ones among the saved rows (`current`), which may stay
 */
export function useRepresentativeItems(
  current: readonly { representativeId: number }[],
): SearchComboboxItem[] {
  const { data: representatives = emptyRepresentatives } = useQuery({
    queryKey: ["representatives"],
    queryFn: () => getRepresentatives(),
  });

  return useMemo(() => {
    const currentIds = new Set(current.map((row) => row.representativeId));
    return representatives
      .filter((r) => r.active || currentIds.has(r.id))
      .map((r) => ({
        value: r.id,
        label: r.active ? r.name : `${r.name} (Pasif)`,
      }))
      .toSorted((a, b) => compareTr(a.label, b.label));
  }, [representatives, current]);
}
