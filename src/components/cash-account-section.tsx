"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { FieldError as FormFieldError } from "react-hook-form";
import { SearchCombobox } from "@/components/search-combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { cashAccountItems } from "@/lib/cash-account-items";
import type { CashAccountListItem } from "@/lib/fetches/cash-account";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The Kasa - Banka an ödeme or tahsilat goes through, as its own section
 * under the form: Aktif accounts (plus `currentId`, the record's own, when
 * editing), and the picked account's saved Bakiye with a link to it.
 */
export function CashAccountSection({
  accounts,
  currentId,
  value,
  onChange,
  onBlur,
  error,
}: {
  accounts: readonly CashAccountListItem[];
  currentId: number | null;
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
            <span className="text-muted-foreground">
              Bakiye:{" "}
              <span
                className={cn(
                  "font-medium tabular-nums text-foreground",
                  picked.balance.startsWith("-") && "text-destructive",
                )}
              >
                {formatAmount(picked.balance)}
              </span>
            </span>
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
