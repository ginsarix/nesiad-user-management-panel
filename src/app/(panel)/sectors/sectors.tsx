"use client";

import { useQuery } from "@tanstack/react-query";
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  type SortFn,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Pencil, Plus, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import { SortableTableHeader } from "@/components/sortable-table-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { usePersistedColumnVisibility } from "@/hooks/use-persisted-column-visibility";
import { getSectors, type Sector } from "@/lib/fetches/sector";
import { compareTr, foldTr } from "@/lib/turkish";
import { DeleteSectorButton } from "./delete-sector-button";
import { SectorDialog } from "./sector-dialog";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const sortByName: SortFn<typeof features, Sector> = (a, b) =>
  compareTr(a.original.name, b.original.name);

const sortByMemberCount: SortFn<typeof features, Sector> = (a, b) =>
  a.original.memberCount - b.original.memberCount;

const helper = createColumnHelper<typeof features, Sector>();

const DEFAULT_COLUMN_VISIBILITY = {};
const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

const emptySectors: Sector[] = [];

export function Sectors() {
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState(DEFAULT_SORTING);
  // keeps the sector while the dialog animates closed
  const [dialog, setDialog] = useState<{ open: boolean; sector?: Sector }>({
    open: false,
  });

  const { data: sectors = emptySectors, isError } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => getSectors(),
  });

  const filteredSectors = useMemo(() => {
    const needle = foldTr(query.trim());
    if (!needle) return sectors;
    return sectors.filter((sector) => foldTr(sector.name).includes(needle));
  }, [sectors, query]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: "Sektör",
          enableHiding: false,
          sortFn: sortByName,
          cell: (info) => (
            <span className="font-medium">{info.getValue()}</span>
          ),
        }),
        helper.accessor("memberCount", {
          header: "Üye Sayısı",
          sortFn: sortByMemberCount,
          sortDescFirst: true,
          cell: ({ row }) =>
            row.original.memberCount > 0 ? (
              <Link
                href={`/members?sector=${row.original.id}&status=all`}
                className="text-primary hover:underline"
              >
                {row.original.memberCount} üye
              </Link>
            ) : (
              <span className="text-muted-foreground">Üye yok</span>
            ),
        }),
        helper.display({
          id: "actions",
          enableHiding: false,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${row.original.name} sektörünü düzenle`}
                className="text-muted-foreground"
                onClick={() => setDialog({ open: true, sector: row.original })}
              >
                <Pencil />
              </Button>
              <DeleteSectorButton sector={row.original} />
            </div>
          ),
        }),
      ]),
    [],
  );

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "sectors",
    DEFAULT_COLUMN_VISIBILITY,
  );

  const table = useTable({
    features,
    columns,
    data: filteredSectors,
    getRowId: (sector) => String(sector.id),
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sektör ara"
            aria-label="Sektör ara"
            className="bg-card pl-8"
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {filteredSectors.length === sectors.length
            ? `${sectors.length} sektör`
            : `${filteredSectors.length} / ${sectors.length} sektör`}
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <Button onClick={() => setDialog({ open: true })}>
          <Plus />
          Sektör Ekle
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card [&_[data-slot=table-container]]:max-h-[calc(100svh-9.5rem)]">
        <Table>
          <SortableTableHeader headerGroups={table.getHeaderGroups()} />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columnCount}
                  className="py-10 text-center text-muted-foreground"
                >
                  {isError
                    ? "Sektörler yüklenirken bir hata oluştu."
                    : sectors.length === 0
                      ? "Henüz sektör eklenmemiş."
                      : "Aramanızla eşleşen sektör bulunamadı."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SectorDialog
        sector={dialog.sector}
        open={dialog.open}
        onOpenChange={(open) =>
          setDialog((previous) => ({ ...previous, open }))
        }
      />
    </div>
  );
}
