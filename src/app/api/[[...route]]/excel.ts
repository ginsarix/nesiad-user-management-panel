import type { Context } from "hono";
import type { CellObject } from "write-excel-file/node";
import { todayInIstanbul } from "@/lib/dates";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** TL with two decimals; Excel applies the viewer's separators */
export const AMOUNT_FORMAT = '#,##0.00 "₺"';
export const DATE_FORMAT = "dd.mm.yyyy";

export function header(text: string): CellObject {
  return { value: text, fontWeight: "bold" };
}

/** A "1250.50" amount as a number cell */
export function amountCell(amount: string): CellObject {
  return { value: Number(amount), type: Number, format: AMOUNT_FORMAT };
}

/** A yyyy-aa-gg date as a date cell (midnight UTC, so no day shift) */
export function dateCell(isoDate: string): CellObject {
  return {
    value: new Date(`${isoDate}T00:00:00Z`),
    type: Date,
    format: DATE_FORMAT,
  };
}

/** The file as a download named e.g. "odemeler-2026-11-10.xlsx" */
export function xlsxResponse(
  c: Context,
  buffer: Buffer,
  baseName: "odemeler" | "cariler" | "tahsilatlar",
) {
  return c.body(new Uint8Array(buffer), 200, {
    "Content-Type": XLSX_TYPE,
    "Content-Disposition": `attachment; filename="${baseName}-${todayInIstanbul()}.xlsx"`,
    "Cache-Control": "no-store",
  });
}
