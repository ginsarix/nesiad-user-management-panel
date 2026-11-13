import { TableCell, TableFooter, TableRow } from "@/components/ui/table";
import { formatAmount, sumAmounts } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A "Toplam" row pinned under a table: the sum of the shown rows' amounts
 * under the amount column, summed on the fly in kuruş (`sumAmounts`).
 * `columnIds` are the visible columns in order; nothing is drawn when the
 * amount column is hidden or there are no rows.
 */
export function TableTotalFooter({
  columnIds,
  amountColumnId,
  amounts,
  alignRight = false,
}: {
  columnIds: readonly string[];
  amountColumnId: string;
  amounts: readonly string[];
  /** match the amount column's cells */
  alignRight?: boolean;
}) {
  if (amounts.length === 0 || !columnIds.includes(amountColumnId)) return null;

  return (
    // bg-muted, not the default translucent one, so rows don't show through
    // while it's stuck; a shadow because collapsed borders scroll away
    <TableFooter className="sticky bottom-0 z-10 border-t-0 bg-muted shadow-[inset_0_1px_0_var(--color-border)]">
      <TableRow className="border-b-0 hover:bg-transparent">
        {columnIds.map((id, index) => (
          <TableCell
            key={id}
            className={cn(
              id === amountColumnId && "tabular-nums",
              id === amountColumnId && alignRight && "text-right",
            )}
          >
            {id === amountColumnId
              ? formatAmount(sumAmounts(amounts))
              : index === 0
                ? "Toplam"
                : null}
          </TableCell>
        ))}
      </TableRow>
    </TableFooter>
  );
}
