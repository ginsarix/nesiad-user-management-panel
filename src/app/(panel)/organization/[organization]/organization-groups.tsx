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
import { SortableTableHeader } from "@/components/sortable-table-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { usePersistedColumnVisibility } from "@/hooks/use-persisted-column-visibility";
import {
  getOrganizationGroups,
  type OrganizationGroupListItem,
} from "@/lib/fetches/organization";
import { rememberListSearch } from "@/lib/list-href";
import {
  ORGANIZATION_INFO,
  type Organization,
  organizationHref,
} from "@/lib/organizations";
import { compareTr, foldTr } from "@/lib/turkish";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

type Row = OrganizationGroupListItem & { href: string };

const sortByName: SortFn<typeof features, Row> = (a, b) =>
  compareTr(a.original.name, b.original.name);

const sortByCount: SortFn<typeof features, Row> = (a, b) =>
  a.original.personCount - b.original.personCount;

const helper = createColumnHelper<typeof features, Row>();

const columns = helper.columns([
  helper.accessor("name", {
    header: "İsim",
    enableHiding: false,
    sortFn: sortByName,
    cell: ({ row }) => (
      <Link
        href={row.original.href}
        className="font-medium text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  }),
  helper.accessor("personCount", {
    header: "Kişi Sayısı",
    sortFn: sortByCount,
    sortDescFirst: true,
    cell: (info) =>
      info.getValue() > 0 ? (
        <span className="tabular-nums">{info.getValue()}</span>
      ) : (
        <span className="text-muted-foreground">Yok</span>
      ),
  }),
]);

const DEFAULT_COLUMN_VISIBILITY = {};

const SORTABLE_COLUMNS = ["name", "personCount"];
const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

/** `?sort=-personCount` <-> table sorting state */
function parseSort(value: string | null): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id) ? [{ id, desc }] : DEFAULT_SORTING;
}

function serializeSort([sort]: SortingState) {
  if (!sort || (sort.id === "name" && !sort.desc)) return null;
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

const emptyGroups: OrganizationGroupListItem[] = [];

/** One Organizasyon page's list of groups */
export function OrganizationGroups({
  organization,
  savedColumnVisibility,
}: {
  organization: Organization;
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const info = ORGANIZATION_INFO[organization];
  const listPath = organizationHref(organization);
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sorting, setSorting] = useState(() =>
    parseSort(searchParams.get("sort")),
  );

  // Mirror the list state into the URL without a server round trip
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberListSearch(listPath, search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [listPath, query, sorting]);

  const { data: groups = emptyGroups, isError } = useQuery({
    queryKey: ["organizations", organization],
    queryFn: () => getOrganizationGroups(organization),
  });

  const rowsData = useMemo(() => {
    const needle = foldTr(query.trim());
    return groups
      .filter((group) => !needle || foldTr(group.name).includes(needle))
      .map((group) => ({
        ...group,
        href: organizationHref(organization, String(group.id)),
      }));
  }, [groups, query, organization]);

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    `organization-${organization}`,
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: rowsData,
    getRowId: (group) => String(group.id),
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
            placeholder="İsim ara"
            aria-label={`${info.singular} ara`}
            className="bg-card pl-8"
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {rowsData.length === groups.length
            ? `${groups.length} ${info.noun}`
            : `${rowsData.length} / ${groups.length} ${info.noun}`}
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <Link
          href={organizationHref(organization, "new")}
          className={buttonVariants()}
        >
          <Plus />
          {info.singular} Ekle
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
                    ? "Liste yüklenirken bir hata oluştu."
                    : groups.length === 0
                      ? "Henüz kayıt eklenmemiş."
                      : "Aramanızla eşleşen kayıt bulunamadı."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
