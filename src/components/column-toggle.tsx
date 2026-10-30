"use client";

import { Columns3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** What the menu needs from a TanStack table column (with columnVisibilityFeature) */
type ToggleableColumn = {
  id: string;
  columnDef: { header?: unknown };
  getCanHide: () => boolean;
  getIsVisible: () => boolean;
  toggleVisibility: (value?: boolean) => void;
};

/**
 * "Sütunlar" menu for showing/hiding a table's columns. Pass
 * `table.getAllLeafColumns()`; columns with `enableHiding: false` aren't
 * listed. Labels come from string headers.
 */
export function ColumnToggle({
  columns,
  className,
}: {
  columns: ToggleableColumn[];
  className?: string;
}) {
  const toggleable = columns.filter((column) => column.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "bg-card",
          className,
        )}
      >
        <Columns3 />
        Sütunlar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Gösterilecek sütunlar</DropdownMenuLabel>
          {toggleable.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => column.toggleVisibility(checked)}
              // keep the menu open to toggle several columns
              closeOnClick={false}
            >
              {typeof column.columnDef.header === "string"
                ? column.columnDef.header
                : column.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
