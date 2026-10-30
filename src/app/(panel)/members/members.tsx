"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  createSortedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  type SortFn,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Plus,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMembers, type MemberListItem } from "@/lib/fetches/member";
import { compareTr, foldTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";
import {
  MemberAvatar,
  MemberFields,
  orDash,
  RepresentativeList,
} from "./_components/member-info";
import { rememberMembersListSearch } from "./_lib/list-href";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowExpandingFeature,
});

const sortTr: SortFn<typeof features, MemberListItem> = (a, b, columnId) =>
  compareTr(
    a.getValue<string | null>(columnId) ?? "",
    b.getValue<string | null>(columnId) ?? "",
  );

const helper = createColumnHelper<typeof features, MemberListItem>();

const columns = helper.columns([
  helper.accessor("title", {
    header: "Ünvan",
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
  helper.accessor("memberLoginDate", {
    header: "Üye Giriş Tarihi",
    enableSorting: false,
    cell: (info) => orDash(info.getValue()),
  }),
]);

const SORTABLE_COLUMNS = ["title", "sector"];
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

const emptyMembers: MemberListItem[] = [];

export function Members() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sector, setSector] = useState(() => searchParams.get("sector"));
  const [sorting, setSorting] = useState(() =>
    parseSort(searchParams.get("sort")),
  );

  // Mirror the list state into the URL without a server round trip, so
  // back navigation and shared links restore it
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sector) params.set("sector", sector);
    const sort = serializeSort(sorting);
    if (sort) params.set("sort", sort);

    const search = params.toString();
    rememberMembersListSearch(search);
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [query, sector, sorting]);

  const { data: members = emptyMembers, isError } = useQuery({
    queryKey: ["members"],
    queryFn: () => getMembers(),
  });

  const sectorItems = useMemo(() => {
    const sectors = new Set(
      members.map((m) => m.sector?.trim()).filter((s): s is string => !!s),
    );
    return [
      { value: null as string | null, label: "Tüm sektörler" },
      ...[...sectors].toSorted(compareTr).map((s) => ({ value: s, label: s })),
    ];
  }, [members]);

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
          (!sector || member.sector?.trim() === sector) &&
          (!needle || text.includes(needle)),
      )
      .map(({ member }) => member);
  }, [searchIndex, query, sector]);

  const table = useTable({
    features,
    columns,
    data: filteredMembers,
    getRowId: (member) => String(member.id),
    getRowCanExpand: () => true,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const columnCount = columns.length;

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
              <SelectItem key={item.label} value={item.value}>
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
        <Link href="/members/new" className={buttonVariants()}>
          <Plus />
          Üye Ekle
        </Link>
      </div>

      {/* The table scrolls inside its own box so the header can stay sticky */}
      <div className="overflow-hidden rounded-lg border bg-card [&_[data-slot=table-container]]:max-h-[calc(100svh-9.5rem)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted
                          ? sorted === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className="text-xs text-muted-foreground"
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" && <ArrowUp className="size-3.5" />}
                          {sorted === "desc" && (
                            <ArrowDown className="size-3.5" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  onClick={() => row.toggleExpanded()}
                  data-state={row.getIsExpanded() ? "selected" : undefined}
                  className="cursor-pointer"
                >
                  {row.getAllCells().map((cell) => (
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
      <MemberFields
        fields={[
          { label: "Adres", value: member.address },
          { label: "Kuruluş Tarihi", value: member.foundingDate },
          { label: "Kıdem Tarihi", value: member.seniorityDate },
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
