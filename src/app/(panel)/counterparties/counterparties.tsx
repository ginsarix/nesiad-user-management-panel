"use client";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnVisibilityState,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  type SortFn,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { FileSpreadsheet, Plus, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import { orDash } from "@/components/info-fields";
import { SortableTableHeader } from "@/components/sortable-table-header";
import { TableTotalFooter } from "@/components/table-total-footer";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { usePersistedColumnVisibility } from "@/hooks/use-persisted-column-visibility";
import {
  type CounterpartyListItem,
  counterpartiesExportHref,
  getCounterparties,
} from "@/lib/fetches/counterparty";
import { rememberListSearch } from "@/lib/list-href";
import { formatAmount } from "@/lib/money";
import { compareTr, foldTr } from "@/lib/turkish";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const sortByText: SortFn<typeof features, CounterpartyListItem> = (
  a,
  b,
  columnId,
) => compareTr(a.getValue<string>(columnId), b.getValue<string>(columnId));

const sortByTotal: SortFn<typeof features, CounterpartyListItem> = (a, b) =>
  Number(a.original.totalPaid) - Number(b.original.totalPaid);

const helper = createColumnHelper<typeof features, CounterpartyListItem>();

const columns = helper.columns([
  helper.accessor("title", {
    header: "Ünvan",
    enableHiding: false,
    sortFn: sortByText,
    cell: ({ row }) => (
      <Link
        href={`/counterparties/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.original.title}
      </Link>
    ),
  }),
  helper.accessor((counterparty) => counterparty.city ?? undefined, {
    id: "city",
    header: "Şehir",
    sortFn: sortByText,
    sortUndefined: "last",
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor("district", {
    header: "İlçe",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor("address", {
    header: "Adres",
    enableSorting: false,
    cell: (info) => (
      <span className="line-clamp-2 max-w-64 whitespace-normal">
        {orDash(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("phone", {
    header: "Telefon",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor("email", {
    header: "E-posta",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor("totalPaid", {
    header: "Toplam Ödenen",
    sortFn: sortByTotal,
    sortDescFirst: true,
    cell: ({ row }) =>
      row.original.paymentCount > 0 ? (
        <span className="tabular-nums">
          {formatAmount(row.original.totalPaid)}
        </span>
      ) : (
        <span className="text-muted-foreground">Ödeme yok</span>
      ),
  }),
]);

// Adres can be switched on from "Sütunlar"
const DEFAULT_COLUMN_VISIBILITY = { address: false };

const SORTABLE_COLUMNS = ["title", "city", "totalPaid"];
const DEFAULT_SORTING: SortingState = [{ id: "title", desc: false }];

/** `?sort=city` / `?sort=-totalPaid` <-> table sorting state */
function parseSort(value: string | null): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id) ? [{ id, desc }] : DEFAULT_SORTING;
}

function serializeSort([sort]: SortingState) {
  if (!sort || (sort.id === "title" && !sort.desc)) return null;
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

const emptyCounterparties: CounterpartyListItem[] = [];

export function Counterparties({
  savedColumnVisibility,
}: {
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sorting, setSorting] = useState(() =>
    parseSort(searchParams.get("sort")),
  );

  // Mirror the list state into the URL without a server round trip, so
  // back navigation and shared links restore it
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberListSearch("/counterparties", search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [query, sorting]);

  const { data: counterparties = emptyCounterparties, isError } = useQuery({
    queryKey: ["counterparties"],
    queryFn: () => getCounterparties(),
  });

  // Ünvan only, so the Excel export (which filters the same way) matches
  const filteredCounterparties = useMemo(() => {
    const needle = foldTr(query.trim());
    if (!needle) return counterparties;
    return counterparties.filter((counterparty) =>
      foldTr(counterparty.title).includes(needle),
    );
  }, [counterparties, query]);

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "counterparties",
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: filteredCounterparties,
    getRowId: (counterparty) => String(counterparty.id),
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const columnCount = visibleColumns.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ünvan ara"
            aria-label="Cari ara"
            className="bg-card pl-8"
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {filteredCounterparties.length === counterparties.length
            ? `${counterparties.length} cari`
            : `${filteredCounterparties.length} / ${counterparties.length} cari`}
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <a
          href={counterpartiesExportHref(query)}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          <FileSpreadsheet />
          Excel'e aktar
        </a>
        <Link href="/counterparties/new" className={buttonVariants()}>
          <Plus />
          Cari Ekle
        </Link>
      </div>

      {/* The table scrolls inside its own box so the header can stay sticky */}
      <div className="overflow-hidden rounded-lg border bg-card [&_[data-slot=table-container]]:max-h-[calc(100svh-9.5rem)]">
        <Table>
          <SortableTableHeader headerGroups={table.getHeaderGroups()} />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="align-top">
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
                    ? "Cariler yüklenirken bir hata oluştu."
                    : counterparties.length === 0
                      ? "Henüz cari eklenmemiş."
                      : "Aramanızla eşleşen cari bulunamadı."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableTotalFooter
            columnIds={visibleColumns.map((column) => column.id)}
            amountColumnId="totalPaid"
            amounts={rows.map((row) => row.original.totalPaid)}
          />
        </Table>
      </div>
    </div>
  );
}
