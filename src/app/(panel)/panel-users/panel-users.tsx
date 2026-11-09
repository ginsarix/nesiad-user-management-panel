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
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { ColumnToggle } from "@/components/column-toggle";
import { SortableTableHeader } from "@/components/sortable-table-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { usePersistedColumnVisibility } from "@/hooks/use-persisted-column-visibility";
import { formatDisplayDate } from "@/lib/dates";
import { getPanelUsers, type PanelUser } from "@/lib/fetches/panel-user";
import { formatPhone } from "@/lib/sms/phone";
import { compareTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";
import { AddUserDialog } from "./_components/add-user-dialog";
import { type Notice, RowActions } from "./_components/row-actions";

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

type Status = "active" | "pending" | "disabled";

function statusOf(user: PanelUser): Status {
  if (user.banned) return "disabled";
  return user.emailVerified ? "active" : "pending";
}

const STATUS_LABELS: Record<Status, string> = {
  active: "Aktif",
  pending: "Doğrulama bekliyor",
  disabled: "Devre dışı",
};

function StatusTag({ status }: { status: Status }) {
  if (status === "active") return <span>{STATUS_LABELS.active}</span>;
  return (
    <span
      title={
        status === "pending"
          ? "Kullanıcı e-postasındaki giriş bağlantısını henüz açmadı"
          : undefined
      }
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "pending"
          ? "border-sidebar-primary/50 bg-sidebar-primary/15 text-[#6f5618]"
          : "text-muted-foreground",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const sortByName: SortFn<typeof features, PanelUser> = (a, b) =>
  compareTr(a.original.name, b.original.name);

const sortByCreatedAt: SortFn<typeof features, PanelUser> = (a, b) =>
  new Date(a.original.createdAt).getTime() -
  new Date(b.original.createdAt).getTime();

const helper = createColumnHelper<typeof features, PanelUser>();

const DEFAULT_COLUMN_VISIBILITY = {};
const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

const emptyUsers: PanelUser[] = [];

export function PanelUsers({
  currentUserId,
  savedColumnVisibility,
}: {
  currentUserId: string;
  savedColumnVisibility: ColumnVisibilityState;
}) {
  const [sorting, setSorting] = useState(DEFAULT_SORTING);
  const [notice, setNotice] = useState<Notice | null>(null);

  const { data: users = emptyUsers, isError } = useQuery({
    queryKey: ["panel-users"],
    queryFn: () => getPanelUsers(),
  });

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: "Ad Soyad",
          enableHiding: false,
          sortFn: sortByName,
          cell: ({ row }) => (
            <span className="flex items-center gap-2 font-medium">
              {row.original.name}
              {row.original.id === currentUserId && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  Siz
                </span>
              )}
            </span>
          ),
        }),
        helper.accessor("email", {
          header: "E-posta",
          enableSorting: false,
        }),
        helper.accessor((user) => (user.phone ? formatPhone(user.phone) : ""), {
          id: "phone",
          header: "Telefon",
          enableSorting: false,
          cell: ({ getValue }) =>
            getValue() || (
              <span className="text-muted-foreground">Numara yok</span>
            ),
        }),
        helper.accessor((user) => STATUS_LABELS[statusOf(user)], {
          id: "status",
          header: "Durum",
          enableSorting: false,
          cell: ({ row }) => <StatusTag status={statusOf(row.original)} />,
        }),
        helper.accessor("createdAt", {
          header: "Eklenme Tarihi",
          sortFn: sortByCreatedAt,
          cell: (info) => formatDisplayDate(new Date(info.getValue())),
        }),
        helper.display({
          id: "actions",
          enableHiding: false,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <RowActions
                user={row.original}
                isCurrentUser={row.original.id === currentUserId}
                onNotice={setNotice}
              />
            </div>
          ),
        }),
      ]),
    [currentUserId],
  );

  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(
    "panel-users",
    DEFAULT_COLUMN_VISIBILITY,
    savedColumnVisibility,
  );

  const table = useTable({
    features,
    columns,
    data: users,
    getRowId: (user) => user.id,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Panele giriş yapabilen kişiler. Her kullanıcı diğerlerini yönetebilir.
        </p>
        <span className="ml-auto text-sm text-muted-foreground">
          {users.length} kullanıcı
        </span>
        <ColumnToggle columns={table.getAllLeafColumns()} />
        <AddUserDialog />
      </div>

      {notice && (
        <output
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            notice.tone === "error"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "bg-card",
          )}
        >
          <span className="flex-1">{notice.text}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Kapat"
            onClick={() => setNotice(null)}
          >
            <X />
          </Button>
        </output>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
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
                    ? "Kullanıcılar yüklenirken bir hata oluştu."
                    : "Henüz kullanıcı yok."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
