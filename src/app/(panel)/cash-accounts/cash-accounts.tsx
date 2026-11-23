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
import { Plus, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import { PassiveTag } from "@/components/info-fields";
import { SortableTableHeader } from "@/components/sortable-table-header";
import { TableTotalFooter } from "@/components/table-total-footer";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { usePersistedColumnVisibility } from "@/hooks/use-persisted-column-visibility";
import {
  type CashAccountListItem,
  getCashAccounts,
} from "@/lib/fetches/cash-account";
import { rememberListSearch } from "@/lib/list-href";
import { formatAmount, toKurus } from "@/lib/money";
import { compareTr, foldTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const sortByName: SortFn<typeof features, CashAccountListItem> = (a, b) =>
  compareTr(a.original.name, b.original.name);

const sortByBalance: SortFn<typeof features, CashAccountListItem> = (a, b) => {
  const difference = toKurus(a.original.balance) - toKurus(b.original.balance);
  return difference === BigInt(0) ? 0 : difference < BigInt(0) ? -1 : 1;
};

const sortByStatus: SortFn<typeof features, CashAccountListItem> = (a, b) =>
  Number(b.original.active) - Number(a.original.active);

const helper = createColumnHelper<typeof features, CashAccountListItem>();

const columns = helper.columns([
  helper.accessor("name", {
    header: "İsim",
    enableHiding: false,
    sortFn: sortByName,
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <Link
          href={`/cash-accounts/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
        {!row.original.active && <PassiveTag />}
      </span>
    ),
  }),
  helper.accessor("balance", {
    header: "Bakiye",
    sortFn: sortByBalance,
    sortDescFirst: true,
    cell: (info) => (
      <span
        className={cn(
          "block text-right tabular-nums",
          info.getValue().startsWith("-") && "text-destructive",
        )}
      >
        {formatAmount(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("active", {
    header: "Durum",
    sortFn: sortByStatus,
    cell: (info) => (info.getValue() ? "Aktif" : "Pasif"),
  }),
]);

const DEFAULT_COLUMN_VISIBILITY = {};

type Status = "active" | "passive" | "all";

const STATUS_ITEMS: { value: Status; label: string }[] = [
  { value: "active", label: "Aktif hesaplar" },
  { value: "passive", label: "Pasif hesaplar" },
  { value: "all", label: "Tüm hesaplar" },
];

/** `?status=passive` / `?status=all`; aktif when absent */
function parseStatus(value: string | null): Status {
  return value === "passive" || value === "all" ? value : "active";
}

const SORTABLE_COLUMNS = ["name", "balance", "active"];
const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

/** `?sort=balance` / `?sort=-balance` <-> table sorting state */
function parseSort(value: string | null): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id) ? [{ id, desc }] : DEFAULT_SORTING;
}

function serializeSort([sort]: SortingState) {
  if (!sort || (sort.id === "name" && !sort.desc)) return null;
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

const emptyAccounts: CashAccountListItem[] = [];

export function CashAccounts({
  savedColumnVisibility,
}: {
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState(() =>
    parseStatus(searchParams.get("status")),
  );
  const [sorting, setSorting] = useState(() =>
    parseSort(searchParams.get("sort")),
  );

  // Mirror the list state into the URL without a server round trip
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "active") params.set("status", status);
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberListSearch("/cash-accounts", search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [query, status, sorting]);

  const { data: accounts = emptyAccounts, isError } = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => getCashAccounts(),
  });

  const filteredAccounts = useMemo(() => {
    const needle = foldTr(query.trim());
    return accounts.filter(
      (account) =>
        (status === "all" || account.active === (status === "active")) &&
        (!needle || foldTr(account.name).includes(needle)),
    );
  }, [accounts, query, status]);

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "cash-accounts",
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: filteredAccounts,
    getRowId: (account) => String(account.id),
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
            placeholder="Hesap adı ara"
            aria-label="Kasa - Banka ara"
            className="bg-card pl-8"
          />
        </div>
        <Select
          items={STATUS_ITEMS}
          value={status}
          onValueChange={(value) => setStatus(value ?? "active")}
        >
          <SelectTrigger aria-label="Durum" className="min-w-40 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filteredAccounts.length === accounts.length
            ? `${accounts.length} hesap`
            : `${filteredAccounts.length} / ${accounts.length} hesap`}
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <Link href="/cash-accounts/new" className={buttonVariants()}>
          <Plus />
          Kasa - Banka Ekle
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
                    ? "Hesaplar yüklenirken bir hata oluştu."
                    : accounts.length === 0
                      ? "Henüz Kasa - Banka eklenmemiş."
                      : "Aramanızla eşleşen hesap bulunamadı."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableTotalFooter
            columnIds={visibleColumns.map((column) => column.id)}
            amountColumnId="balance"
            amounts={rows.map((row) => row.original.balance)}
            alignRight
          />
        </Table>
      </div>
    </div>
  );
}
