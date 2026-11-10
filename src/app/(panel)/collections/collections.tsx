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
import {
  type CollectionFilters,
  collectionFiltersToParams,
  NO_COLLECTION_FILTERS,
  parseCollectionFilters,
} from "@/lib/collection-filters";
import { dateFilterText, isoToDisplay } from "@/lib/dates";
import {
  type CollectionRow,
  collectionsExportHref,
  getCollections,
} from "@/lib/fetches/collection";
import { getMembers, type MemberListItem } from "@/lib/fetches/member";
import { getParameters, type Parameter } from "@/lib/fetches/parameter";
import { getProjects, type ProjectListItem } from "@/lib/fetches/project";
import { rememberListSearch } from "@/lib/list-href";
import { formatAmount } from "@/lib/money";
import { projectLabel } from "@/lib/projects";
import { compareTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";
import { MissingPrerequisitesNotice } from "./_components/missing-prerequisites-notice";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

/** Newest first by default; ties keep the newest record first */
const sortByDate: SortFn<typeof features, CollectionRow> = (a, b) =>
  a.original.date < b.original.date
    ? -1
    : a.original.date > b.original.date
      ? 1
      : a.original.id - b.original.id;

const sortByText: SortFn<typeof features, CollectionRow> = (a, b, columnId) =>
  compareTr(
    a.getValue<string | undefined>(columnId) ?? "",
    b.getValue<string | undefined>(columnId) ?? "",
  );

const sortByAmount: SortFn<typeof features, CollectionRow> = (a, b) =>
  Number(a.original.amount) - Number(b.original.amount);

const helper = createColumnHelper<typeof features, CollectionRow>();

function projectOf(row: CollectionRow) {
  return row.projectName && row.projectNumber
    ? projectLabel({ name: row.projectName, number: row.projectNumber })
    : undefined;
}

const columns = helper.columns([
  helper.accessor("date", {
    header: "Tarih",
    enableHiding: false,
    sortFn: sortByDate,
    sortDescFirst: true,
    cell: ({ row }) => (
      <Link
        href={`/collections/${row.original.id}/edit`}
        className="font-medium text-primary hover:underline"
      >
        {formatDate(row.original.date)}
      </Link>
    ),
  }),
  helper.accessor("memberTitle", {
    header: "Üye",
    sortFn: sortByText,
    cell: ({ row }) => (
      <Link
        href={`/members/${row.original.memberId}`}
        className="hover:underline"
      >
        {row.original.memberTitle}
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
    header: "Tahsilat Türü",
    sortFn: sortByText,
  }),
  helper.accessor("methodName", {
    header: "Tahsilat Tipi",
    sortFn: sortByText,
  }),
  helper.accessor(projectOf, {
    id: "project",
    header: "Proje",
    sortFn: sortByText,
    sortUndefined: "last",
    cell: ({ row }) => {
      const label = projectOf(row.original);
      return label && row.original.projectId ? (
        <Link
          href={`/projects/${row.original.projectId}`}
          className="hover:underline"
        >
          {label}
        </Link>
      ) : (
        "—"
      );
    },
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
  "memberTitle",
  "amount",
  "categoryName",
  "methodName",
  "project",
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

// the proje filter's "Projesiz" choice, kept apart from real proje ids
const NO_PROJECT_ITEM = -1;

const emptyCollections: CollectionRow[] = [];
const emptyMembers: MemberListItem[] = [];
const emptyParameters: Parameter[] = [];
const emptyProjects: ProjectListItem[] = [];

export function Collections({
  savedColumnVisibility,
}: {
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState(() =>
    parseCollectionFilters(searchParams),
  );
  const updateFilters = (patch: Partial<CollectionFilters>) =>
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
    setFilters(NO_COLLECTION_FILTERS);
    setFromText("");
    setToText("");
  };
  const hasFilters = Object.values(filters).some((value) => value !== null);

  // Mirror the filters and sorting into the URL without a server round trip
  useEffect(() => {
    const params = new URLSearchParams(collectionFiltersToParams(filters));
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberListSearch("/collections", search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [filters, sorting]);

  const { data, isError, isPlaceholderData } = useQuery({
    queryKey: ["collections", "list", filters],
    queryFn: () => getCollections(filters),
    // keep the current rows on screen while the filtered ones load
    placeholderData: keepPreviousData,
  });
  const collections = data?.collections ?? emptyCollections;

  const { data: loadedMembers } = useQuery({
    queryKey: ["members"],
    queryFn: () => getMembers(),
  });
  const { data: loadedParameters } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });
  const { data: projects = emptyProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const members = loadedMembers ?? emptyMembers;
  const parameters = loadedParameters ?? emptyParameters;

  // Aktif members, plus the one being filtered by (it may be Pasif now)
  const memberItems = useMemo(
    () =>
      members
        .filter((m) => m.status === "active" || m.id === filters.member)
        .map((m) => ({ value: m.id, label: m.title }))
        .toSorted((a, b) => compareTr(a.label, b.label)),
    [members, filters.member],
  );
  const categoryItems = useMemo(
    () =>
      parameters
        .filter((p) => p.kind === "collection_category")
        .map((p) => ({ value: p.id, label: p.name })),
    [parameters],
  );
  const methodItems = useMemo(
    () =>
      parameters
        .filter((p) => p.kind === "collection_method")
        .map((p) => ({ value: p.id, label: p.name })),
    [parameters],
  );
  // every proje, Pasif ones too: their tahsilatlar stay findable
  const projectItems = useMemo(
    () => [
      { value: NO_PROJECT_ITEM, label: "Projesiz" },
      ...projects.map((p) => ({ value: p.id, label: projectLabel(p) })),
    ],
    [projects],
  );

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "collections",
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: collections,
    getRowId: (collection) => String(collection.id),
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
        members={loadedMembers}
        parameters={loadedParameters}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <div className="w-34 [&_input]:bg-card">
            <DatePickerInput
              id="collections-from"
              value={fromText}
              onChange={(text) => applyDate("from", text)}
              placeholder="Başlangıç"
              aria-invalid={fromState === "invalid"}
            />
          </div>
          –
          <div className="w-34 [&_input]:bg-card">
            <DatePickerInput
              id="collections-to"
              value={toText}
              onChange={(text) => applyDate("to", text)}
              placeholder="Bitiş"
              aria-invalid={toState === "invalid"}
            />
          </div>
        </div>
        <div className="w-56 [&_input]:bg-card">
          <SearchCombobox
            id="collections-member"
            items={memberItems}
            value={filters.member}
            onChange={(member) => updateFilters({ member })}
            placeholder="Tüm üyeler"
            noItemsText="Aktif üye yok."
            noMatchText="Aramanızla eşleşen üye yok."
          />
        </div>
        <div className="w-44 [&_input]:bg-card">
          <SearchCombobox
            id="collections-category"
            items={categoryItems}
            value={filters.category}
            onChange={(category) => updateFilters({ category })}
            placeholder="Tüm türler"
            noItemsText="Tahsilat türü yok."
            noMatchText="Eşleşen tahsilat türü yok."
          />
        </div>
        <div className="w-44 [&_input]:bg-card">
          <SearchCombobox
            id="collections-method"
            items={methodItems}
            value={filters.method}
            onChange={(method) => updateFilters({ method })}
            placeholder="Tüm tipler"
            noItemsText="Tahsilat tipi yok."
            noMatchText="Eşleşen tahsilat tipi yok."
          />
        </div>
        <div className="w-56 [&_input]:bg-card">
          <SearchCombobox
            id="collections-project"
            items={projectItems}
            value={
              filters.project === "none" ? NO_PROJECT_ITEM : filters.project
            }
            onChange={(value) =>
              updateFilters({
                project: value === NO_PROJECT_ITEM ? "none" : value,
              })
            }
            placeholder="Tüm projeler"
            noItemsText="Proje yok."
            noMatchText="Eşleşen proje yok."
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
                {data.count} tahsilat ·{" "}
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
            href={collectionsExportHref(filters)}
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
          <Link href="/collections/new" className={buttonVariants()}>
            <Plus />
            Tahsilat Ekle
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
                    ? "Tahsilatlar yüklenirken bir hata oluştu."
                    : hasFilters
                      ? "Filtrelerle eşleşen tahsilat bulunamadı."
                      : "Henüz tahsilat eklenmemiş."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
