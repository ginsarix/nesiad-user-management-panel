"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
import { FileSpreadsheet, Plus, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import { formatDate, orDash } from "@/components/info-fields";
import { SearchCombobox } from "@/components/search-combobox";
import { SortableTableHeader } from "@/components/sortable-table-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { usePersistedColumnVisibility } from "@/hooks/use-persisted-column-visibility";
import { dateFilterText, isoToDisplay } from "@/lib/dates";
import {
  type CounterpartyListItem,
  getCounterparties,
} from "@/lib/fetches/counterparty";
import { getParameters, type Parameter } from "@/lib/fetches/parameter";
import {
  getPayments,
  type PaymentRow,
  paymentsExportHref,
} from "@/lib/fetches/payment";
import { rememberListSearch } from "@/lib/list-href";
import { formatAmount } from "@/lib/money";
import {
  NO_PAYMENT_FILTERS,
  type PaymentFilters,
  parsePaymentFilters,
  paymentFiltersToParams,
} from "@/lib/payment-filters";
import { compareTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";
import { MissingPrerequisitesNotice } from "./_components/missing-prerequisites-notice";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

/** Newest first by default; ties keep the newest record first */
const sortByDate: SortFn<typeof features, PaymentRow> = (a, b) =>
  a.original.date < b.original.date
    ? -1
    : a.original.date > b.original.date
      ? 1
      : a.original.id - b.original.id;

const sortByText: SortFn<typeof features, PaymentRow> = (a, b, columnId) =>
  compareTr(a.getValue<string>(columnId), b.getValue<string>(columnId));

const sortByAmount: SortFn<typeof features, PaymentRow> = (a, b) =>
  Number(a.original.amount) - Number(b.original.amount);

const helper = createColumnHelper<typeof features, PaymentRow>();

const columns = helper.columns([
  helper.accessor("date", {
    header: "Tarih",
    enableHiding: false,
    sortFn: sortByDate,
    sortDescFirst: true,
    cell: ({ row }) => (
      <Link
        href={`/payments/${row.original.id}/edit`}
        className="font-medium text-primary hover:underline"
      >
        {formatDate(row.original.date)}
      </Link>
    ),
  }),
  helper.accessor("counterpartyTitle", {
    header: "Cari",
    sortFn: sortByText,
    cell: ({ row }) => (
      <Link
        href={`/counterparties/${row.original.counterpartyId}`}
        className="hover:underline"
      >
        {row.original.counterpartyTitle}
      </Link>
    ),
  }),
  helper.accessor("amount", {
    header: "Tutar",
    sortFn: sortByAmount,
    sortDescFirst: true,
    cell: (info) => (
      <span className="block text-right tabular-nums">
        {formatAmount(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("categoryName", {
    header: "Ödeme Türü",
    sortFn: sortByText,
  }),
  helper.accessor("methodName", {
    header: "Ödeme Tipi",
    sortFn: sortByText,
  }),
  helper.accessor("note", {
    header: "Not",
    enableSorting: false,
    cell: (info) => (
      <span className="line-clamp-2 max-w-72 whitespace-normal">
        {orDash(info.getValue())}
      </span>
    ),
  }),
]);

const DEFAULT_COLUMN_VISIBILITY = {};

const SORTABLE_COLUMNS = [
  "date",
  "counterpartyTitle",
  "amount",
  "categoryName",
  "methodName",
];
const DEFAULT_SORTING: SortingState = [{ id: "date", desc: true }];

/** `?sort=amount` / `?sort=-amount` <-> table sorting state */
function parseSort(value: string | null): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id) ? [{ id, desc }] : DEFAULT_SORTING;
}

function serializeSort([sort]: SortingState) {
  if (!sort || (sort.id === "date" && sort.desc)) return null;
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

const emptyPayments: PaymentRow[] = [];
const emptyCounterparties: CounterpartyListItem[] = [];
const emptyParameters: Parameter[] = [];

export function Payments({
  savedColumnVisibility,
}: {
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState(() =>
    parsePaymentFilters(searchParams),
  );
  const updateFilters = (patch: Partial<PaymentFilters>) =>
    setFilters((previous) => ({ ...previous, ...patch }));
  const [sorting, setSorting] = useState(() =>
    parseSort(searchParams.get("sort")),
  );

  // dates are typed as gg.aa.yyyy and applied once complete (or cleared)
  const [fromText, setFromText] = useState(() => isoToDisplay(filters.from));
  const [toText, setToText] = useState(() => isoToDisplay(filters.to));
  const applyDate = (key: "from" | "to", text: string) => {
    (key === "from" ? setFromText : setToText)(text);
    const { state, iso } = dateFilterText(text);
    if (state === "empty" || state === "valid") updateFilters({ [key]: iso });
  };
  const fromState = dateFilterText(fromText).state;
  const toState = dateFilterText(toText).state;
  // a half-typed or impossible date leaves the previous range applied, so
  // the total and the export wouldn't match what the inputs show
  const datesPending = [fromState, toState].some(
    (state) => state === "incomplete" || state === "invalid",
  );
  const clearFilters = () => {
    setFilters(NO_PAYMENT_FILTERS);
    setFromText("");
    setToText("");
  };
  const hasFilters = Object.values(filters).some((value) => value !== null);

  // Mirror the filters and sorting into the URL without a server round trip
  useEffect(() => {
    const params = new URLSearchParams(paymentFiltersToParams(filters));
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberListSearch("/payments", search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [filters, sorting]);

  const { data, isError, isPlaceholderData } = useQuery({
    queryKey: ["payments", "list", filters],
    queryFn: () => getPayments(filters),
    // keep the current rows on screen while the filtered ones load
    placeholderData: keepPreviousData,
  });
  const payments = data?.payments ?? emptyPayments;

  const { data: loadedCounterparties } = useQuery({
    queryKey: ["counterparties"],
    queryFn: () => getCounterparties(),
  });
  const { data: loadedParameters } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });
  const counterparties = loadedCounterparties ?? emptyCounterparties;
  const parameters = loadedParameters ?? emptyParameters;
  const counterpartyItems = useMemo(
    () => counterparties.map((c) => ({ value: c.id, label: c.title })),
    [counterparties],
  );
  const categoryItems = useMemo(
    () =>
      parameters
        .filter((p) => p.kind === "payment_category")
        .map((p) => ({ value: p.id, label: p.name })),
    [parameters],
  );
  const methodItems = useMemo(
    () =>
      parameters
        .filter((p) => p.kind === "payment_method")
        .map((p) => ({ value: p.id, label: p.name })),
    [parameters],
  );

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "payments",
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: payments,
    getRowId: (payment) => String(payment.id),
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="flex flex-col gap-3">
      <MissingPrerequisitesNotice
        counterparties={loadedCounterparties}
        parameters={loadedParameters}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <div className="w-34 [&_input]:bg-card">
            <DatePickerInput
              id="payments-from"
              value={fromText}
              onChange={(text) => applyDate("from", text)}
              placeholder="Başlangıç"
              aria-invalid={fromState === "invalid"}
            />
          </div>
          –
          <div className="w-34 [&_input]:bg-card">
            <DatePickerInput
              id="payments-to"
              value={toText}
              onChange={(text) => applyDate("to", text)}
              placeholder="Bitiş"
              aria-invalid={toState === "invalid"}
            />
          </div>
        </div>
        <div className="w-56 [&_input]:bg-card">
          <SearchCombobox
            id="payments-counterparty"
            items={counterpartyItems}
            value={filters.counterparty}
            onChange={(counterparty) => updateFilters({ counterparty })}
            placeholder="Tüm cariler"
            noItemsText="Henüz cari eklenmemiş."
            noMatchText="Aramanızla eşleşen cari yok."
          />
        </div>
        <div className="w-44 [&_input]:bg-card">
          <SearchCombobox
            id="payments-category"
            items={categoryItems}
            value={filters.category}
            onChange={(category) => updateFilters({ category })}
            placeholder="Tüm türler"
            noItemsText="Ödeme türü yok."
            noMatchText="Eşleşen ödeme türü yok."
          />
        </div>
        <div className="w-44 [&_input]:bg-card">
          <SearchCombobox
            id="payments-method"
            items={methodItems}
            value={filters.method}
            onChange={(method) => updateFilters({ method })}
            placeholder="Tüm tipler"
            noItemsText="Ödeme tipi yok."
            noMatchText="Eşleşen ödeme tipi yok."
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            <X />
            Filtreleri temizle
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p
          className={cn(
            "text-sm transition-opacity",
            (isPlaceholderData || datesPending) && "opacity-50",
          )}
        >
          {datesPending ? (
            <span className="text-muted-foreground">
              Tarihi gg.aa.yyyy olarak tamamlayın
            </span>
          ) : data ? (
            <>
              <span className="text-muted-foreground">
                {data.count} ödeme ·{" "}
              </span>
              <span className="font-medium">
                Toplam {formatAmount(data.total)}
              </span>
            </>
          ) : (
            " "
          )}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <ColumnToggle columns={table.getAllLeafColumns()} />
          <a
            href={paymentsExportHref(filters)}
            download
            aria-disabled={datesPending || undefined}
            className={buttonVariants({
              variant: "outline",
              className: cn(datesPending && "pointer-events-none opacity-50"),
            })}
          >
            <FileSpreadsheet />
            Excel'e aktar
          </a>
          <Link href="/payments/new" className={buttonVariants()}>
            <Plus />
            Ödeme Ekle
          </Link>
        </div>
      </div>

      {/* The table scrolls inside its own box so the header can stay sticky */}
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-card transition-opacity [&_[data-slot=table-container]]:max-h-[calc(100svh-14rem)]",
          isPlaceholderData && "opacity-60",
        )}
      >
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
                    ? "Ödemeler yüklenirken bir hata oluştu."
                    : hasFilters
                      ? "Filtrelerle eşleşen ödeme bulunamadı."
                      : "Henüz ödeme eklenmemiş."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
