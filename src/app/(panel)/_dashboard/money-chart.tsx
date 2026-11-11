"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { monthLabel } from "@/lib/dashboard";
import type { Dashboard } from "@/lib/fetches/dashboard";
import { formatAmount } from "@/lib/money";

type Month = Dashboard["money"]["monthly"][number];

// Checked for color-blind separation and 3:1 contrast on white: logo blue
// (as --primary) and a darkened NESIAD gold
const chartConfig = {
  collected: { label: "Tahsilat", color: "#0070db" },
  paid: { label: "Ödeme", color: "#a8862a" },
} satisfies ChartConfig;

const SERIES = ["collected", "paid"] as const;

const compactFormat = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "₺12,5 B" on the axis; exact amounts are in the tooltip and table */
function compactAmount(value: number) {
  return value === 0 ? "0" : `₺${compactFormat.format(value)}`;
}

/** Tahsilat and Ödeme per month, side by side, with a table view under it */
export function MoneyChart({ monthly }: { monthly: Month[] }) {
  // numbers only for drawing; amounts shown are the API's exact strings
  const data = monthly.map((m) => ({
    ...m,
    label: monthLabel(m.month),
    collectedValue: Number(m.collected),
    paidValue: Number(m.paid),
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {SERIES.map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: chartConfig[key].color }}
            />
            {chartConfig[key].label}
          </span>
        ))}
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <BarChart data={data} barGap={2} margin={{ left: 0, right: 0, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={compactAmount}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              const month = payload?.[0]?.payload as
                | (typeof data)[number]
                | undefined;
              if (!active || !month) return null;
              return (
                <div className="grid min-w-44 gap-1.5 rounded-md border bg-card px-3 py-2 text-xs shadow-md">
                  <div className="font-medium">{month.label}</div>
                  {SERIES.map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="size-2.5 rounded-[2px]"
                          style={{ backgroundColor: chartConfig[key].color }}
                        />
                        {chartConfig[key].label}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatAmount(month[key])}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {SERIES.map((key) => (
            <Bar
              key={key}
              dataKey={`${key}Value`}
              name={chartConfig[key].label}
              fill={`var(--color-${key})`}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          ))}
        </BarChart>
      </ChartContainer>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Tablo olarak göster
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-medium">Ay</th>
              <th className="py-1.5 text-right font-medium">Tahsilat</th>
              <th className="py-1.5 text-right font-medium">Ödeme</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((m) => (
              <tr key={m.month} className="border-b last:border-0">
                <td className="py-1.5">{m.label}</td>
                <td className="py-1.5 text-right">
                  {formatAmount(m.collected)}
                </td>
                <td className="py-1.5 text-right">{formatAmount(m.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
