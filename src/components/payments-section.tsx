"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, orDash } from "@/components/info-fields";
import { TableTotalFooter } from "@/components/table-total-footer";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPayments } from "@/lib/fetches/payment";
import { formatAmount, sumAmounts } from "@/lib/money";
import {
  NO_PAYMENT_FILTERS,
  type PaymentFilters,
  paymentFiltersToParams,
} from "@/lib/payment-filters";

/**
 * The ödemeler to one cari or out of one Kasa - Banka, with their count
 * and total. `of` picks which; that column is left out since it's always
 * the same.
 */
export function PaymentsSection({
  of,
  id,
  canAdd = true,
}: {
  of: "counterparty" | "cashAccount";
  id: number;
  /** A new ödeme needs an Aktif Kasa - Banka */
  canAdd?: boolean;
}) {
  const filters: PaymentFilters = {
    ...NO_PAYMENT_FILTERS,
    counterparty: of === "counterparty" ? id : null,
    cashAccount: of === "cashAccount" ? id : null,
  };
  const { data, isError } = useQuery({
    queryKey: ["payments", "list", filters],
    queryFn: () => getPayments(filters),
  });
  // adding or editing from here returns here
  const back = `${of}=${id}`;

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5 pr-1.5 pl-4">
        <h3 className="text-sm font-medium">Ödemeler</h3>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.count} ödeme · Toplam{" "}
            {formatAmount(sumAmounts(data.payments.map((p) => p.amount)))}
          </span>
        )}
        {canAdd && (
          <Link
            href={`/payments/new?${back}`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "ml-auto",
            })}
          >
            <Plus />
            Ödeme Ekle
          </Link>
        )}
      </div>

      {isError ? (
        <p className="p-4 text-sm text-muted-foreground">
          Ödemeler yüklenirken bir hata oluştu.
        </p>
      ) : data && data.payments.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {of === "counterparty"
            ? "Bu cariye henüz ödeme yapılmamış."
            : "Henüz ödeme yok."}
        </p>
      ) : (
        data && (
          <>
            <div className="[&_[data-slot=table-container]]:max-h-[28rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    {of !== "counterparty" && <TableHead>Cari</TableHead>}
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead>Ödeme Türü</TableHead>
                    {of !== "cashAccount" && (
                      <TableHead>Kasa - Banka</TableHead>
                    )}
                    <TableHead>Not</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Link
                          href={`/payments/${payment.id}/edit?${back}`}
                          className="text-primary hover:underline"
                        >
                          {formatDate(payment.date)}
                        </Link>
                      </TableCell>
                      {of !== "counterparty" && (
                        <TableCell>
                          <Link
                            href={`/counterparties/${payment.counterpartyId}`}
                            className="hover:underline"
                          >
                            {payment.counterpartyTitle}
                          </Link>
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(payment.amount)}
                      </TableCell>
                      <TableCell>{payment.categoryName}</TableCell>
                      {of !== "cashAccount" && (
                        <TableCell>{payment.cashAccountName}</TableCell>
                      )}
                      <TableCell>
                        <span className="line-clamp-1 max-w-48 whitespace-normal">
                          {orDash(payment.note)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableTotalFooter
                  columnIds={[
                    "date",
                    ...(of !== "counterparty" ? ["counterparty"] : []),
                    "amount",
                    "category",
                    ...(of !== "cashAccount" ? ["cashAccount"] : []),
                    "note",
                  ]}
                  amountColumnId="amount"
                  amounts={data.payments.map((payment) => payment.amount)}
                  alignRight
                />
              </Table>
            </div>
            <div className="border-t px-4 py-2 text-sm">
              <Link
                href={`/payments?${new URLSearchParams(paymentFiltersToParams(filters))}`}
                className="text-primary hover:underline"
              >
                Tüm ödemelerde göster
              </Link>
            </div>
          </>
        )
      )}
    </section>
  );
}
