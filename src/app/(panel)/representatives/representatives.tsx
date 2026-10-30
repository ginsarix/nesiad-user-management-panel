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
import { Plus, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import { formatDate, orDash, PassiveTag } from "@/components/info-fields";
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
import {
  getRepresentatives,
  type RepresentativeListItem,
} from "@/lib/fetches/representative";
import { rememberListSearch } from "@/lib/list-href";
import { compareTr, foldTr } from "@/lib/turkish";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const sortByName: SortFn<typeof features, RepresentativeListItem> = (a, b) =>
  compareTr(a.original.name, b.original.name);

/** ISO dates; empty values are placed via sortUndefined */
const sortByValue: SortFn<typeof features, RepresentativeListItem> = (
  a,
  b,
  columnId,
) => {
  const left = a.getValue<string>(columnId);
  const right = b.getValue<string>(columnId);
  return left < right ? -1 : left > right ? 1 : 0;
};

const helper = createColumnHelper<typeof features, RepresentativeListItem>();

const columns = helper.columns([
  helper.accessor("name", {
    header: "Ad Soyad",
    enableHiding: false,
    sortFn: sortByName,
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <Link
          href={`/representatives/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
        {!row.original.active && <PassiveTag />}
      </span>
    ),
  }),
  helper.display({
    id: "members",
    header: "Bağlı Üyeler",
    cell: ({ row }) =>
      row.original.members.length === 0 ? (
        "—"
      ) : (
        <ul className="flex flex-col gap-0.5">
          {row.original.members.map((member) => (
            <li key={member.id}>
              {member.title}
              {member.role && (
                <span className="text-muted-foreground"> · {member.role}</span>
              )}
            </li>
          ))}
        </ul>
      ),
  }),
  helper.accessor("phone", {
    header: "Cep Telefonu",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor("email", {
    header: "E-posta",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor((representative) => representative.dateOfBirth ?? undefined, {
    id: "dateOfBirth",
    header: "Doğum Tarihi",
    sortFn: sortByValue,
    sortUndefined: "last",
    cell: (info) => formatDate(info.getValue()),
  }),
  helper.accessor("notes", {
    header: "Notlar",
    enableSorting: false,
    cell: (info) => (
      <span className="line-clamp-2 max-w-64 whitespace-normal">
        {orDash(info.getValue())}
      </span>
    ),
  }),
]);

// Extra details that can be switched on from "Sütunlar"
const DEFAULT_COLUMN_VISIBILITY = { notes: false };

type Status = "active" | "passive" | "all";

const STATUS_ITEMS: { value: Status; label: string }[] = [
  { value: "active", label: "Aktif yetkililer" },
  { value: "passive", label: "Pasif yetkililer" },
  { value: "all", label: "Tüm yetkililer" },
];

/** `?status=passive` / `?status=all`; aktif when absent */
function parseStatus(value: string | null): Status {
  return value === "passive" || value === "all" ? value : "active";
}

const SORTABLE_COLUMNS = ["name", "dateOfBirth"];
const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

/** `?sort=name` / `?sort=-dateOfBirth` <-> table sorting state */
function parseSort(value: string | null): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id) ? [{ id, desc }] : DEFAULT_SORTING;
}

function serializeSort([sort]: SortingState) {
  if (!sort || (sort.id === "name" && !sort.desc)) return null;
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

const emptyRepresentatives: RepresentativeListItem[] = [];

export function Representatives() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState(() =>
    parseStatus(searchParams.get("status")),
  );
  const [sorting, setSorting] = useState(() =>
    parseSort(searchParams.get("sort")),
  );

  // Mirror the list state into the URL without a server round trip, so
  // back navigation and shared links restore it
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "active") params.set("status", status);
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberListSearch("/representatives", search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [query, status, sorting]);

  const { data: representatives = emptyRepresentatives, isError } = useQuery({
    queryKey: ["representatives"],
    queryFn: () => getRepresentatives(),
  });

  const searchIndex = useMemo(
    () =>
      representatives.map((representative) => ({
        representative,
        text: foldTr(
          [
            representative.name,
            representative.phone,
            // lets "5321234567" match "0532 123 45 67"
            representative.phone?.replace(/\D/g, ""),
            representative.email,
            ...representative.members.flatMap((m) => [m.title, m.role]),
          ]
            .filter(Boolean)
            .join(" "),
        ),
      })),
    [representatives],
  );

  const filteredRepresentatives = useMemo(() => {
    const needle = foldTr(query.trim());
    return searchIndex
      .filter(
        ({ representative, text }) =>
          (status === "all" ||
            representative.active === (status === "active")) &&
          (!needle || text.includes(needle)),
      )
      .map(({ representative }) => representative);
  }, [searchIndex, query, status]);

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "representatives",
    DEFAULT_COLUMN_VISIBILITY,
  );

  const table = useTable({
    features,
    columns,
    data: filteredRepresentatives,
    getRowId: (representative) => String(representative.id),
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
            placeholder="Ad, telefon, e-posta veya üye ara"
            aria-label="Yetkili ara"
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
          {filteredRepresentatives.length === representatives.length
            ? `${representatives.length} yetkili`
            : `${filteredRepresentatives.length} / ${representatives.length} yetkili`}
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <Link href="/representatives/new" className={buttonVariants()}>
          <Plus />
          Yetkili Ekle
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
                    ? "Yetkililer yüklenirken bir hata oluştu."
                    : representatives.length === 0
                      ? "Henüz yetkili eklenmemiş."
                      : "Aramanızla eşleşen yetkili bulunamadı."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
