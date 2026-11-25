"use client";

import { TriangleAlert } from "lucide-react";
import { CollectionsSection } from "@/components/collections-section";
import { PaymentsSection } from "@/components/payments-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isCarryStale, periodRangeText } from "@/lib/cash-account-periods";
import { isoToDisplay } from "@/lib/dates";
import type { CashAccount } from "@/lib/fetches/cash-account";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CarryOverButton } from "./carry-over-button";

type Period = CashAccount["periods"][number];

function Figure({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          amount.startsWith("-") && "text-destructive",
        )}
      >
        {formatAmount(amount)}
      </span>
    </div>
  );
}

/** One tab per period, oldest first, opening on the current one */
export function PeriodTabs({ account }: { account: CashAccount }) {
  const { periods } = account;
  if (periods.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Bu hesabın dönemi yok. Düzenle&apos;den dönem ekleyin.
      </p>
    );
  }
  const opening = String(account.currentPeriodId ?? periods[0].id);

  return (
    <Tabs key={opening} defaultValue={opening} className="flex flex-col gap-3">
      <TabsList className="h-auto flex-wrap">
        {periods.map((period) => (
          <TabsTrigger key={period.id} value={String(period.id)}>
            {isoToDisplay(period.startDate)}
          </TabsTrigger>
        ))}
      </TabsList>
      {periods.map((period) => (
        <TabsContent
          key={period.id}
          value={String(period.id)}
          className="flex flex-col gap-4"
        >
          <PeriodSummary account={account} period={period} />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <CollectionsSection
              of="cashAccount"
              id={account.id}
              canAdd={account.active}
              from={period.startDate}
              to={period.endDate}
            />
            <PaymentsSection
              of="cashAccount"
              id={account.id}
              canAdd={account.active}
              from={period.startDate}
              to={period.endDate}
            />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PeriodSummary({
  account,
  period,
}: {
  account: CashAccount;
  period: Period;
}) {
  const source = account.periods.find(
    (p) => p.id === period.carriedFromPeriodId,
  );
  const stale =
    source !== undefined && isCarryStale(period, period.sourceBalance);

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        {periodRangeText(period.startDate, period.nextStartDate)}
      </p>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Figure label="Başlangıç Bakiyesi" amount={period.openingBalance} />
        <Figure label="Tahsilatlar" amount={period.collected} />
        <Figure label="Ödemeler" amount={period.paid} />
        <Figure label="Bakiye" amount={period.balance} />
      </div>
      {stale && source && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            {isoToDisplay(source.startDate)} döneminden devredilen{" "}
            {formatAmount(period.carriedAmount ?? "0")}; kaynağın güncel
            bakiyesi {formatAmount(source.balance)}.
          </span>
          <CarryOverButton
            accountId={account.id}
            from={source}
            to={period}
            label="Tekrar devir et"
            size="sm"
          />
        </div>
      )}
    </section>
  );
}
