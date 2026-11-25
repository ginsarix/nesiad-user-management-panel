"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { InfoFields, PassiveTag } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import { isoToDisplay } from "@/lib/dates";
import { getCashAccount } from "@/lib/fetches/cash-account";
import { listHref } from "@/lib/list-href";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CarryOverBox } from "./carry-over-box";
import { DeleteCashAccountButton } from "./delete-cash-account-button";
import { OutsidePeriodsNotice } from "./outside-periods-notice";
import { PeriodTabs } from "./period-tabs";
import { ToggleActiveButton } from "./toggle-active-button";

export function CashAccountDetails({ id }: { id: number }) {
  const { data: account, isError } = useQuery({
    queryKey: ["cash-accounts", id],
    queryFn: () => getCashAccount(id),
  });

  const currentStart = account?.periods.find(
    (period) => period.id === account.currentPeriodId,
  )?.startDate;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={listHref("/cash-accounts")}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Kasa - Banka listesine dön
      </Link>

      {isError && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Hesap bilgileri yüklenirken bir hata oluştu.
        </p>
      )}

      {account && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium">{account.name}</h2>
                {!account.active && <PassiveTag />}
              </div>
              <p className="text-sm text-muted-foreground">
                Bakiye{" "}
                <span
                  className={cn(
                    "text-xl font-semibold tabular-nums text-foreground",
                    account.balance?.startsWith("-") && "text-destructive",
                  )}
                >
                  {account.balance === null
                    ? "—"
                    : formatAmount(account.balance)}
                </span>
                {currentStart && <> ({isoToDisplay(currentStart)} dönemi)</>}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <ToggleActiveButton account={account} />
              <Link
                href={`/cash-accounts/${account.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil />
                Düzenle
              </Link>
              <DeleteCashAccountButton account={account} />
            </div>
          </div>

          <section className="rounded-lg border bg-card">
            <h3 className="border-b px-4 py-2.5 text-sm font-medium">
              Bilgiler
            </h3>
            <div className="p-4">
              <InfoFields
                fields={[
                  {
                    label: "Durum",
                    value: account.active ? "Aktif" : "Pasif",
                  },
                ]}
              />
            </div>
          </section>

          <OutsidePeriodsNotice account={account} />
          <CarryOverBox
            key={account.periods.map((period) => period.id).join()}
            account={account}
          />
          <PeriodTabs account={account} />
        </>
      )}
    </div>
  );
}
