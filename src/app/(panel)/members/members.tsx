"use client";

import { useQuery } from "@tanstack/react-query";
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  type SortFn,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowRight, ChevronRight, Plus, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import {
  formatDate,
  InfoFields,
  orDash,
  PassiveTag,
} from "@/components/info-fields";
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
import { membershipYears } from "@/lib/dates";
import { getMembers, type MemberListItem } from "@/lib/fetches/member";
import { getSectors, type Sector } from "@/lib/fetches/sector";
import { rememberListSearch } from "@/lib/list-href";
import { compareTr, foldTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";
import {
  MemberAvatar,
  RepresentativeList,
  SeniorityBadge,
} from "./_components/member-info";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowExpandingFeature,
});

const sortTr: SortFn<typeof features, MemberListItem> = (a, b, columnId) =>
  compareTr(
    a.getValue<string | null>(columnId) ?? "",
    b.getValue<string | null>(columnId) ?? "",
  );

/** For ISO dates and numbers; empty values are placed via sortUndefined */
const sortByValue: SortFn<typeof features, MemberListItem> = (
  a,
  b,
  columnId,
) => {
  const left = a.getValue<string | number>(columnId);
  const right = b.getValue<string | number>(columnId);
  return left < right ? -1 : left > right ? 1 : 0;
};

const helper = createColumnHelper<typeof features, MemberListItem>();

const columns = helper.columns([
  helper.accessor("title", {
    header: "Ünvan",
    enableHiding: false,
    sortFn: sortTr,
    cell: ({ row }) => (
      <button
        type="button"
        aria-expanded={row.getIsExpanded()}
        onClick={(event) => {
          // the row itself also toggles on click
          event.stopPropagation();
          row.toggleExpanded();
        }}
        className="flex items-center gap-2 text-left font-medium outline-none focus-visible:underline"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            row.getIsExpanded() && "rotate-90",
          )}
        />
        <MemberAvatar title={row.original.title} logo={row.original.logo} />
        {row.original.title}
        {!row.original.active && <PassiveTag />}
      </button>
    ),
  }),
  helper.accessor("sector", {
    header: "Sektör",
    sortFn: sortTr,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor("phone", {
    header: "Telefon",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor(
    (member) => member.representatives.map((r) => r.name).join(", "),
    {
      id: "representatives",
      header: "Yetkililer",
      enableSorting: false,
      cell: (info) => orDash(info.getValue()),
    },
  ),
  helper.accessor((member) => member.memberLoginDate ?? undefined, {
    id: "memberLoginDate",
    header: "Üye Giriş Tarihi",
    sortFn: sortByValue,
    sortUndefined: "last",
    cell: (info) => formatDate(info.getValue()),
  }),
  helper.accessor(
    (member) => membershipYears(member.memberLoginDate) ?? undefined,
    {
      id: "seniority",
      header: "Kıdem",
      sortFn: sortByValue,
      sortUndefined: "last",
      // most senior first on the first click
      sortDescFirst: true,
      cell: ({ row }) => (
        <SeniorityBadge memberLoginDate={row.original.memberLoginDate} />
      ),
    },
  ),
  helper.accessor("address", {
    header: "Adres",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
  helper.accessor("foundingDate", {
    header: "Kuruluş Tarihi",
    enableSorting: false,
    cell: (info) => formatDate(info.getValue()),
  }),
]);

// Extra details that can be switched on from "Sütunlar"
const DEFAULT_COLUMN_VISIBILITY = { address: false, foundingDate: false };

type MemberStatus = "active" | "passive" | "all";

const STATUS_ITEMS: { value: MemberStatus; label: string }[] = [
  { value: "active", label: "Aktif üyeler" },
  { value: "passive", label: "Pasif üyeler" },
  { value: "all", label: "Tüm üyeler" },
];

/** `?status=passive` / `?status=all`; aktif when absent */
function parseStatus(value: string | null): MemberStatus {
  return value === "passive" || value === "all" ? value : "active";
}

function matchesStatus(member: MemberListItem, status: MemberStatus) {
  if (status === "all") return true;
  return member.active === (status === "active");
}

const SORTABLE_COLUMNS = ["title", "sector", "memberLoginDate", "seniority"];
const DEFAULT_SORTING: SortingState = [{ id: "title", desc: false }];

/** `?sort=title` / `?sort=-sector` <-> table sorting state */
function parseSort(value: string | null): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id) ? [{ id, desc }] : DEFAULT_SORTING;
}

function serializeSort([sort]: SortingState) {
  if (!sort || (sort.id === "title" && !sort.desc)) return null;
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

/** `?sector=12`: a sector id */
function parseSector(value: string | null) {
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}

const emptyMembers: MemberListItem[] = [];
const emptySectors: Sector[] = [];

export function Members() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sector, setSector] = useState(() =>
    parseSector(searchParams.get("sector")),
  );
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
    if (sector) params.set("sector", String(sector));
    if (status !== "active") params.set("status", status);
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberListSearch("/members", search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [query, sector, status, sorting]);

  const { data: members = emptyMembers, isError } = useQuery({
    queryKey: ["members"],
    queryFn: () => getMembers(),
  });

  const { data: sectors = emptySectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => getSectors(),
  });

  const sectorItems = useMemo(
    () => [
      { value: null as number | null, label: "Tüm sektörler" },
      ...sectors.map((s) => ({ value: s.id, label: s.name })),
    ],
    [sectors],
  );

  const searchIndex = useMemo(
    () =>
      members.map((member) => ({
        member,
        text: foldTr(
          [
            member.title,
            member.sector,
            member.phone,
            // lets "2123650" match "212 36 50"
            member.phone?.replace(/\D/g, ""),
            ...member.representatives.map((r) => r.name),
          ]
            .filter(Boolean)
            .join(" "),
        ),
      })),
    [members],
  );

  const filteredMembers = useMemo(() => {
    const needle = foldTr(query.trim());
    return searchIndex
      .filter(
        ({ member, text }) =>
          matchesStatus(member, status) &&
          (!sector || member.sectorId === sector) &&
          (!needle || text.includes(needle)),
      )
      .map(({ member }) => member);
  }, [searchIndex, query, sector, status]);

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "members",
    DEFAULT_COLUMN_VISIBILITY,
  );

  const table = useTable({
    features,
    columns,
    data: filteredMembers,
    getRowId: (member) => String(member.id),
    getRowCanExpand: () => true,
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
            placeholder="Ünvan, telefon, sektör veya yetkili ara"
            aria-label="Üye ara"
            className="bg-card pl-8"
          />
        </div>
        <Select items={sectorItems} value={sector} onValueChange={setSector}>
          <SelectTrigger aria-label="Sektör" className="min-w-44 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sectorItems.map((item) => (
              <SelectItem key={item.value ?? "all"} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={STATUS_ITEMS}
          value={status}
          onValueChange={(value) => setStatus(value ?? "active")}
        >
          <SelectTrigger aria-label="Durum" className="min-w-36 bg-card">
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
          {filteredMembers.length === members.length
            ? `${members.length} üye`
            : `${filteredMembers.length} / ${members.length} üye`}
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <Link href="/members/new" className={buttonVariants()}>
          <Plus />
          Üye Ekle
        </Link>
      </div>

      {/* The table scrolls inside its own box so the header can stay sticky */}
      <div className="overflow-hidden rounded-lg border bg-card [&_[data-slot=table-container]]:max-h-[calc(100svh-9.5rem)]">
        <Table>
          <SortableTableHeader headerGroups={table.getHeaderGroups()} />
          <TableBody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  onClick={() => row.toggleExpanded()}
                  data-state={row.getIsExpanded() ? "selected" : undefined}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
                {row.getIsExpanded() && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={columnCount}
                      className="whitespace-normal"
                    >
                      <MemberSummary member={row.original} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}

            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columnCount}
                  className="py-10 text-center text-muted-foreground"
                >
                  {isError
                    ? "Üyeler yüklenirken bir hata oluştu."
                    : members.length === 0
                      ? "Henüz üye eklenmemiş."
                      : "Aramanızla eşleşen üye bulunamadı."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MemberSummary({ member }: { member: MemberListItem }) {
  return (
    <div className="flex flex-wrap items-start gap-x-12 gap-y-4 py-2 pl-8">
      <InfoFields
        fields={[
          { label: "Adres", value: member.address },
          { label: "Kuruluş Tarihi", value: formatDate(member.foundingDate) },
        ]}
      />
      <div className="min-w-64">
        <div className="mb-2 text-sm text-muted-foreground">Yetkililer</div>
        <RepresentativeList representatives={member.representatives} />
      </div>
      <Link
        href={`/members/${member.id}`}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "ml-auto self-end",
        )}
      >
        Tüm detaylar
        <ArrowRight />
      </Link>
    </div>
  );
}
