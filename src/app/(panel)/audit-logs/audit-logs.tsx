"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ColumnVisibilityState,
  columnVisibilityFeature,
  createColumnHelper,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, SearchIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import { InfoFields, orDash } from "@/components/info-fields";
import { SortableTableHeader } from "@/components/sortable-table-header";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
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
  AUDIT_ENTITY_TYPES,
  type AuditEntityTypeFilter,
  type AuditFilters,
  auditFiltersToParams,
  NO_ACTOR,
  parseAuditFilters,
} from "@/lib/audit-filters";
import {
  auditActionLabel,
  ENTITY_TYPE_LABELS,
  formatAuditTime,
} from "@/lib/audit-labels";
import { displayToIso, isoToDisplay } from "@/lib/dates";
import { type AuditLogRow, getAuditLogs } from "@/lib/fetches/audit-log";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  columnVisibilityFeature,
  // only for the shared header; the log is always newest first
  rowSortingFeature,
  rowExpandingFeature,
});

/** No user: the system (seed, scripts), or a stranger for failed logins */
function actorLabel(row: AuditLogRow) {
  if (row.actorName) return row.actorName;
  return row.action === "login_failed" ? "—" : "Sistem";
}

/** One line in the table; the expanded row has everything */
function summary(row: AuditLogRow) {
  const changes = row.changes ?? [];
  if (changes.length === 1) {
    const [{ label, from, to }] = changes;
    return `${label}: ${from} → ${to}`;
  }
  if (changes.length > 1) return changes.map((c) => c.label).join(", ");
  if (row.action === "login_failed") return row.details?.[0]?.value ?? "";
  return "";
}

function hasDetails(row: AuditLogRow) {
  return !!(row.changes?.length || row.details?.length || row.ip);
}

const helper = createColumnHelper<typeof features, AuditLogRow>();

const columns = helper.columns([
  helper.accessor("createdAt", {
    header: "Tarih",
    enableHiding: false,
    cell: (info) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatAuditTime(info.getValue())}
      </span>
    ),
  }),
  helper.accessor(actorLabel, { id: "actor", header: "Kullanıcı" }),
  helper.accessor((row) => auditActionLabel(row.entityType, row.action), {
    id: "action",
    header: "İşlem",
    enableHiding: false,
    cell: ({ row, getValue }) =>
      hasDetails(row.original) ? (
        <button
          type="button"
          aria-expanded={row.getIsExpanded()}
          onClick={() => row.toggleExpanded()}
          className="flex items-center gap-1.5 text-left outline-none focus-visible:underline"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              row.getIsExpanded() && "rotate-90",
            )}
          />
          {getValue()}
        </button>
      ) : (
        <span className="pl-5.5">{getValue()}</span>
      ),
  }),
  helper.accessor((row) => orDash(row.entityLabel), {
    id: "entity",
    header: "Kayıt",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  helper.accessor(summary, {
    id: "summary",
    header: "Ayrıntı",
    cell: (info) => (
      <span className="line-clamp-1 max-w-md whitespace-normal text-muted-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  helper.accessor((row) => orDash(row.ip), { id: "ip", header: "IP Adresi" }),
]);

// IP is only on login entries; it can be switched on from "Sütunlar"
const DEFAULT_COLUMN_VISIBILITY = { ip: false };

const TYPE_ITEMS = [
  { value: null as AuditEntityTypeFilter | null, label: "Tüm kayıtlar" },
  ...AUDIT_ENTITY_TYPES.map((type) => ({
    value: type,
    label: ENTITY_TYPE_LABELS[type],
  })),
];

const emptyRows: AuditLogRow[] = [];

export function AuditLogs({
  savedColumnVisibility,
}: {
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState(() => parseAuditFilters(searchParams));
  // any filter change starts again from the first page
  const updateFilters = (patch: Partial<AuditFilters>) =>
    setFilters((previous) => ({ ...previous, ...patch, page: 1 }));

  // typing is debounced into the query
  const [search, setSearch] = useState(filters.q);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((previous) =>
        previous.q === search.trim()
          ? previous
          : { ...previous, q: search.trim(), page: 1 },
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  // dates are typed as gg.aa.yyyy and applied once complete (or cleared)
  const [fromText, setFromText] = useState(() => isoToDisplay(filters.from));
  const [toText, setToText] = useState(() => isoToDisplay(filters.to));
  const applyDate = (key: "from" | "to", text: string) => {
    (key === "from" ? setFromText : setToText)(text);
    if (!text.trim()) updateFilters({ [key]: null });
    else {
      const iso = displayToIso(text);
      if (iso) updateFilters({ [key]: iso });
    }
  };

  // Mirror the filters into the URL without a server round trip
  useEffect(() => {
    const search = new URLSearchParams(
      auditFiltersToParams(filters),
    ).toString();
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
  }, [filters]);

  const { data, isError, isPlaceholderData } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => getAuditLogs(filters),
    // keep the current page on screen while the next one loads
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? emptyRows;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;

  const actorItems = useMemo(
    () => [
      { value: null as string | null, label: "Tüm kullanıcılar" },
      { value: NO_ACTOR, label: "Sistem / bilinmeyen" },
      ...(data?.actors ?? []).map((actor) => ({
        value: actor.id,
        label: actor.name,
      })),
    ],
    [data?.actors],
  );

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "audit-logs",
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => String(row.id),
    getRowCanExpand: (row) => hasDetails(row.original),
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    enableSorting: false,
  });

  const tableRows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;
  const firstShown = total === 0 ? 0 : (filters.page - 1) * pageSize + 1;
  const lastShown = Math.min(filters.page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-60">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Kayıt veya kullanıcı ara"
            aria-label="Denetim kayıtlarında ara"
            className="bg-card pl-8"
          />
        </div>
        <Select
          items={actorItems}
          value={filters.actor}
          onValueChange={(actor) => updateFilters({ actor })}
        >
          <SelectTrigger aria-label="Kullanıcı" className="min-w-40 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actorItems.map((item) => (
              <SelectItem key={item.value ?? "all"} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={TYPE_ITEMS}
          value={filters.type}
          onValueChange={(type) => updateFilters({ type })}
        >
          <SelectTrigger aria-label="Kayıt türü" className="min-w-36 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_ITEMS.map((item) => (
              <SelectItem key={item.value ?? "all"} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <div className="w-34 [&_input]:bg-card">
            <DatePickerInput
              id="audit-from"
              value={fromText}
              onChange={(text) => applyDate("from", text)}
              placeholder="Başlangıç"
            />
          </div>
          –
          <div className="w-34 [&_input]:bg-card">
            <DatePickerInput
              id="audit-to"
              value={toText}
              onChange={(text) => applyDate("to", text)}
              placeholder="Bitiş"
            />
          </div>
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {total} kayıt
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-card transition-opacity [&_[data-slot=table-container]]:max-h-[calc(100svh-12rem)]",
          isPlaceholderData && "opacity-60",
        )}
      >
        <Table>
          <SortableTableHeader headerGroups={table.getHeaderGroups()} />
          <TableBody>
            {tableRows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsExpanded() ? "selected" : undefined}
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
                      <EntryDetails row={row.original} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}

            {tableRows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columnCount}
                  className="py-10 text-center text-muted-foreground"
                >
                  {isError
                    ? "Denetim kayıtları yüklenirken bir hata oluştu."
                    : "Bu filtrelerle eşleşen kayıt yok."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        <span>
          {firstShown}–{lastShown} / {total}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          disabled={filters.page <= 1}
          onClick={() =>
            setFilters((previous) => ({ ...previous, page: previous.page - 1 }))
          }
        >
          <ChevronLeft />
          Önceki
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          disabled={filters.page >= lastPage}
          onClick={() =>
            setFilters((previous) => ({ ...previous, page: previous.page + 1 }))
          }
        >
          Sonraki
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function EntryDetails({ row }: { row: AuditLogRow }) {
  return (
    <div className="flex flex-wrap items-start gap-x-12 gap-y-4 py-2 pl-6">
      {!!row.changes?.length && (
        <table className="text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="pr-6 pb-1 text-left font-medium">Alan</th>
              <th className="pr-6 pb-1 text-left font-medium">Önceki</th>
              <th className="pb-1 text-left font-medium">Yeni</th>
            </tr>
          </thead>
          <tbody>
            {row.changes.map((change) => (
              <tr key={change.label} className="align-top">
                <td className="py-0.5 pr-6 text-muted-foreground">
                  {change.label}
                </td>
                <td className="py-0.5 pr-6 line-through decoration-muted-foreground/50">
                  {change.from}
                </td>
                <td className="py-0.5">{change.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!!row.details?.length && <InfoFields fields={row.details} />}
      {row.ip && (
        <InfoFields
          fields={[
            { label: "IP Adresi", value: row.ip },
            { label: "Tarayıcı", value: row.userAgent },
          ]}
        />
      )}
    </div>
  );
}
