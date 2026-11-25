"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { FieldError as FormFieldError } from "react-hook-form";
import { SearchCombobox } from "@/components/search-combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { cashAccountItems } from "@/lib/cash-account-items";
import { periodIndexFor } from "@/lib/cash-account-periods";
import { displayToIso, isoToDisplay } from "@/lib/dates";
import type { CashAccountListItem } from "@/lib/fetches/cash-account";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The Kasa - Banka an ödeme or tahsilat goes through, as its own section
 * under the form: Aktif accounts (plus `currentId`, the record's own, when
 * editing), and the saved Bakiye of the picked account's period that `date`
 * (the form's, as typed) falls in, with a link to the account. A date
 * before every period gets a warning; the save isn't refused.
 */
export function CashAccountSection({
  accounts,
  currentId,
  value,
  onChange,
  onBlur,
  error,
  date,
}: {
  accounts: readonly CashAccountListItem[];
  currentId: number | null;
  /** The record's date as typed (gg.aa.yyyy) */
  date: string;
  value: number | null;
  onChange: (id: number | null) => void;
  onBlur: () => void;
  error: FormFieldError | undefined;
}) {
  const items = useMemo(
    () => cashAccountItems(accounts, currentId),
    [accounts, currentId],
  );
  const picked = accounts.find((account) => account.id === value);
  const balance = picked && periodBalance(picked, displayToIso(date));

  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-medium">Kasa - Banka</h2>
      <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="cashAccountId">
            Hesap <span className="text-destructive">*</span>
          </FieldLabel>
          <SearchCombobox
            id="cashAccountId"
            items={items}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            invalid={!!error}
            placeholder="Kasa - Banka seçin"
            noItemsText="Henüz aktif Kasa - Banka yok."
            noMatchText="Aramanızla eşleşen hesap yok."
          />
          <FieldError errors={[error]} />
        </Field>
        {picked && (
          <div className="flex flex-col justify-end gap-1 text-sm sm:pb-2">
            {balance === "outside" ? (
              <span className="flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                Bu tarih hesabın hiçbir dönemine girmiyor; bakiyelere sayılmaz.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Bakiye
                {balance?.startDate &&
                  ` (${isoToDisplay(balance.startDate)} dönemi)`}
                :{" "}
                <span
                  className={cn(
                    "font-medium tabular-nums text-foreground",
                    balance?.amount?.startsWith("-") && "text-destructive",
                  )}
                >
                  {balance?.amount ? formatAmount(balance.amount) : "—"}
                </span>
              </span>
            )}
            <Link
              href={`/cash-accounts/${picked.id}`}
              className="inline-flex w-fit items-center gap-1 text-primary hover:underline"
            >
              Hesaba git
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The account's Bakiye for a record dated `iso`: that date's period, or the
 * current period's while no valid date is typed; "outside" before the
 * first period
 */
function periodBalance(
  account: CashAccountListItem,
  iso: string,
): { startDate: string | null; amount: string | null } | "outside" {
  if (!iso) {
    return { startDate: account.currentPeriodStart, amount: account.balance };
  }
  const period = account.periods[periodIndexFor(account.periods, iso)];
  if (!period) return "outside";
  return { startDate: period.startDate, amount: period.balance };
}
