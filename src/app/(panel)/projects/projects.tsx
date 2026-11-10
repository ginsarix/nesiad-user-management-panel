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
import { getProjects, type ProjectListItem } from "@/lib/fetches/project";
import { rememberListSearch } from "@/lib/list-href";
import { formatAmount } from "@/lib/money";
import { compareTr, foldTr } from "@/lib/turkish";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const sortByText: SortFn<typeof features, ProjectListItem> = (a, b, columnId) =>
  compareTr(a.getValue<string>(columnId), b.getValue<string>(columnId));

const sortByCount: SortFn<typeof features, ProjectListItem> = (a, b) =>
  a.original.collectionCount - b.original.collectionCount;

const sortByTotal: SortFn<typeof features, ProjectListItem> = (a, b) =>
  Number(a.original.totalCollected) - Number(b.original.totalCollected);

const helper = createColumnHelper<typeof features, ProjectListItem>();

const columns = helper.columns([
  helper.accessor("number", {
    header: "Proje Numarası",
    enableHiding: false,
    sortFn: sortByText,
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  helper.accessor("name", {
    header: "Ad",
    enableHiding: false,
    sortFn: sortByText,
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <Link
          href={`/projects/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
        {!row.original.active && <PassiveTag />}
      </span>
    ),
  }),
  helper.accessor("collectionCount", {
    header: "Tahsilat",
    sortFn: sortByCount,
    sortDescFirst: true,
    cell: (info) =>
      info.getValue() > 0 ? (
        <span className="tabular-nums">{info.getValue()}</span>
      ) : (
        <span className="text-muted-foreground">Yok</span>
      ),
  }),
  helper.accessor("totalCollected", {
    header: "Toplam Tahsilat",
    sortFn: sortByTotal,
    sortDescFirst: true,
    cell: ({ row }) =>
      row.original.collectionCount > 0 ? (
        <span className="tabular-nums">
          {formatAmount(row.original.totalCollected)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
]);

const DEFAULT_COLUMN_VISIBILITY = {};

type Status = "active" | "passive" | "all";

const STATUS_ITEMS: { value: Status; label: string }[] = [
  { value: "active", label: "Aktif projeler" },
  { value: "passive", label: "Pasif projeler" },
  { value: "all", label: "Tüm projeler" },
];

/** `?status=passive` / `?status=all`; aktif when absent */
function parseStatus(value: string | null): Status {
  return value === "passive" || value === "all" ? value : "active";
}

const SORTABLE_COLUMNS = [
  "number",
  "name",
  "collectionCount",
  "totalCollected",
];
const DEFAULT_SORTING: SortingState = [{ id: "number", desc: false }];

/** `?sort=name` / `?sort=-totalCollected` <-> table sorting state */
function parseSort(value: string | null): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id) ? [{ id, desc }] : DEFAULT_SORTING;
}

function serializeSort([sort]: SortingState) {
  if (!sort || (sort.id === "number" && !sort.desc)) return null;
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

const emptyProjects: ProjectListItem[] = [];

export function Projects({
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
    rememberListSearch("/projects", search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [query, status, sorting]);

  const { data: projects = emptyProjects, isError } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });

  const filteredProjects = useMemo(() => {
    const needle = foldTr(query.trim());
    return projects.filter(
      (project) =>
        (status === "all" || project.active === (status === "active")) &&
        (!needle ||
          foldTr(`${project.name} ${project.number}`).includes(needle)),
    );
  }, [projects, query, status]);

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "projects",
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: filteredProjects,
    getRowId: (project) => String(project.id),
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Proje adı veya numarası ara"
            aria-label="Proje ara"
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
          {filteredProjects.length === projects.length
            ? `${projects.length} proje`
            : `${filteredProjects.length} / ${projects.length} proje`}
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <Link href="/projects/new" className={buttonVariants()}>
          <Plus />
          Proje Ekle
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
                    ? "Projeler yüklenirken bir hata oluştu."
                    : projects.length === 0
                      ? "Henüz proje eklenmemiş."
                      : "Aramanızla eşleşen proje bulunamadı."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
