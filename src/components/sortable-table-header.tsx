"use client";

import {
  type Column_RowSorting,
  FlexRender,
  type HeaderGroup,
  type RowData,
  type rowSortingFeature,
  type TableFeatures,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Sticky table header whose sortable columns toggle sorting on click.
 * Pass `table.getHeaderGroups()` of a table with rowSortingFeature.
 */
export function SortableTableHeader<
  TFeatures extends TableFeatures & {
    rowSortingFeature: typeof rowSortingFeature;
  },
  TData extends RowData,
>({ headerGroups }: { headerGroups: HeaderGroup<TFeatures, TData>[] }) {
  return (
    <TableHeader className="sticky top-0 z-10 bg-muted">
      {headerGroups.map((headerGroup) => (
        <TableRow key={headerGroup.id} className="hover:bg-transparent">
          {headerGroup.headers.map((header) => {
            // TypeScript can't resolve the feature-dependent column type for
            // a generic TFeatures, but the constraint guarantees sorting
            const column = header.column as unknown as Column_RowSorting<
              TFeatures,
              TData
            >;
            const sorted = column.getIsSorted();
            return (
              <TableHead
                key={header.id}
                aria-sort={
                  sorted
                    ? sorted === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className="text-xs text-muted-foreground"
              >
                {column.getCanSort() ? (
                  <button
                    type="button"
                    onClick={column.getToggleSortingHandler()}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <FlexRender header={header} />
                    {sorted === "asc" && <ArrowUp className="size-3.5" />}
                    {sorted === "desc" && <ArrowDown className="size-3.5" />}
                  </button>
                ) : (
                  <FlexRender header={header} />
                )}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}
