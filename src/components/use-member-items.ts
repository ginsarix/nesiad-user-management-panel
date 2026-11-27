"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SearchComboboxItem } from "@/components/search-combobox";
import { getMembers, type MemberListItem } from "@/lib/fetches/member";
import { compareTr } from "@/lib/turkish";

const emptyMembers: MemberListItem[] = [];

/**
 * A member picker's items (Tahsilat, Taahhütler, Tahakkuk, Organizasyon):
 * Aktif members, plus the selected ones (`selectedIds`), which may stay even
 * when they are no longer Aktif. The description is the member's company.
 */
export function useMemberItems(
  selectedIds: readonly (number | null | undefined)[],
): SearchComboboxItem[] {
  const { data: members = emptyMembers } = useQuery({
    queryKey: ["members"],
    queryFn: () => getMembers(),
  });

  // a new array every render must not recompute the items
  const selectedKey = selectedIds.join(",");

  return useMemo(() => {
    const selected = new Set(selectedKey.split(",").map(Number));
    return members
      .filter((m) => m.status === "active" || selected.has(m.id))
      .map((m) => ({
        value: m.id,
        label: m.status === "active" ? m.name : `${m.name} (Pasif)`,
        description: m.company?.title ?? undefined,
      }))
      .toSorted((a, b) => compareTr(a.label, b.label));
  }, [members, selectedKey]);
}
