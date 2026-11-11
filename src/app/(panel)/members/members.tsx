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
import { formatDate, orDash, StatusTag } from "@/components/info-fields";
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
import { membershipYears, todayInIstanbul } from "@/lib/dates";
import { getMembers, type MemberListItem } from "@/lib/fetches/member";
import { getSectors, type Sector } from "@/lib/fetches/sector";
import { rememberListSearch } from "@/lib/list-href";
import type { MemberStatus } from "@/lib/member-status";
import { compareTr, foldTr } from "@/lib/turkish";
import { MemberAvatar, SeniorityBadge } from "./_components/member-info";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
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
      <span className="flex items-center gap-2">
        <MemberAvatar title={row.original.title} logo={row.original.logo} />
        <Link
          href={`/members/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.title}
        </Link>
        <StatusTag status={row.original.status} />
      </span>
    ),
  }),
  helper.accessor(
    (member) =>
      [member.applicantFirstName, member.applicantLastName]
        .filter(Boolean)
        .join(" "),
    {
      id: "applicant",
      header: "Başvuran",
      sortFn: sortTr,
      cell: (info) => orDash(info.getValue()),
    },
  ),
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
  helper.accessor("createdAt", {
    id: "appliedAt",
    header: "Başvuru Tarihi",
    sortFn: sortByValue,
    // the timestamp shown as the Istanbul calendar day
    cell: (info) => formatDate(todayInIstanbul(new Date(info.getValue()))),
  }),
]);

// Extra details that can be switched on from "Sütunlar"
const DEFAULT_COLUMN_VISIBILITY = {
  address: false,
  foundingDate: false,
  applicant: false,
  appliedAt: false,
};

/**
 * Under Adaylar and Reddedilenler exactly these columns show, whatever the
 * saved choice: the member columns (login date, kıdem, sektör…) are empty for
 * an applicant. The saved cookie is left alone, so other filters keep it.
 */
const APPLICATION_COLUMNS = ["title", "applicant", "phone", "appliedAt"];
const ALL_COLUMNS = [
  ...APPLICATION_COLUMNS,
  "sector",
  "representatives",
  "memberLoginDate",
  "seniority",
  "address",
  "foundingDate",
];
const APPLICATION_COLUMN_VISIBILITY: ColumnVisibilityState = Object.fromEntries(
  ALL_COLUMNS.map((id) => [id, APPLICATION_COLUMNS.includes(id)]),
);

function isApplicationStatus(status: StatusFilter) {
  return status === "candidate" || status === "rejected";
}

type StatusFilter = MemberStatus | "all";

const STATUS_ITEMS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Aktif üyeler" },
  { value: "passive", label: "Pasif üyeler" },
  { value: "candidate", label: "Adaylar" },
  { value: "rejected", label: "Reddedilenler" },
  { value: "all", label: "Tüm üyeler" },
];

/** `?status=passive` / `candidate` / `rejected` / `all`; aktif when absent */
function parseStatus(value: string | null): StatusFilter {
  return STATUS_ITEMS.find((item) => item.value === value)?.value ?? "active";
}

function matchesStatus(member: MemberListItem, status: StatusFilter) {
  return status === "all" || member.status === status;
}

const SORTABLE_COLUMNS = [
  "title",
  "applicant",
  "sector",
  "memberLoginDate",
  "seniority",
  "appliedAt",
];

/** Applications are read newest first; members by name */
function defaultSorting(status: StatusFilter): SortingState {
  return isApplicationStatus(status)
    ? [{ id: "appliedAt", desc: true }]
    : [{ id: "title", desc: false }];
}

/** `?sort=title` / `?sort=-sector` <-> table sorting state */
function parseSort(value: string | null, status: StatusFilter): SortingState {
  const desc = value?.startsWith("-") ?? false;
  const id = desc ? value?.slice(1) : value;
  return id && SORTABLE_COLUMNS.includes(id)
    ? [{ id, desc }]
    : defaultSorting(status);
}

function serializeSort([sort]: SortingState, status: StatusFilter) {
  const [fallback] = defaultSorting(status);
  if (!sort || (sort.id === fallback?.id && sort.desc === fallback.desc)) {
    return null;
  }
  return `${sort.desc ? "-" : ""}${sort.id}`;
}

/** `?sector=12`: a sector id */
function parseSector(value: string | null) {
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}

const emptyMembers: MemberListItem[] = [];
const emptySectors: Sector[] = [];

export function Members({
  savedColumnVisibility,
}: {
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sector, setSector] = useState(() =>
    parseSector(searchParams.get("sector")),
  );
  const [status, setStatus] = useState(() =>
    parseStatus(searchParams.get("status")),
  );
  const [sorting, setSorting] = useState(() =>
    parseSort(
      searchParams.get("sort"),
      parseStatus(searchParams.get("status")),
    ),
  );

  // Mirror the list state into the URL without a server round trip, so
  // back navigation and shared links restore it
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sector) params.set("sector", String(sector));
    if (status !== "active") params.set("status", status);
    const sort = serializeSort(sorting, status);
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

  const candidateCount = useMemo(
    () => members.filter((member) => member.status === "candidate").length,
    [members],
  );

  const statusItems = useMemo(
    () =>
      STATUS_ITEMS.map((item) =>
        item.value === "candidate" && candidateCount > 0
          ? { ...item, label: `${item.label} (${candidateCount})` }
          : item,
      ),
    [candidateCount],
  );

  const changeStatus = (next: StatusFilter) => {
    // a sort the user didn't choose follows the filter
    if (serializeSort(sorting, status) === null)
      setSorting(defaultSorting(next));
    setStatus(next);
  };

  const searchIndex = useMemo(
    () =>
      members.map((member) => ({
        member,
        text: foldTr(
          [
            member.title,
            member.applicantFirstName,
            member.applicantLastName,
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
    savedColumnVisibility,
  );

  const applicationView = isApplicationStatus(status);

  const table = useTable({
    features,
    columns,
    data: filteredMembers,
    getRowId: (member) => String(member.id),
    state: {
      sorting,
      columnVisibility: applicationView
        ? APPLICATION_COLUMN_VISIBILITY
        : columnVisibility,
    },
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
          items={statusItems}
          value={status}
          onValueChange={(value) => changeStatus(value ?? "active")}
        >
          <SelectTrigger aria-label="Durum" className="min-w-36 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
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
        {/* the application views show a fixed set of columns */}
        {!applicationView && (
          <ColumnToggle columns={table.getAllLeafColumns()} />
        )}
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
