"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, InfoFields, orDash } from "@/components/info-fields";
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
import { getCounterparty } from "@/lib/fetches/counterparty";
import { getPayments } from "@/lib/fetches/payment";
import { listHref } from "@/lib/list-href";
import { formatAmount, sumAmounts } from "@/lib/money";
import { NO_PAYMENT_FILTERS } from "@/lib/payment-filters";
import { DeleteCounterpartyButton } from "./delete-counterparty-button";

export function CounterpartyDetails({ id }: { id: number }) {
  const { data: counterparty, isError } = useQuery({
    queryKey: ["counterparties", id],
    queryFn: () => getCounterparty(id),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={listHref("/counterparties")}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Carilere dön
      </Link>

      {isError && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Cari bilgileri yüklenirken bir hata oluştu.
        </p>
      )}

      {counterparty && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <h2 className="text-lg font-medium">{counterparty.title}</h2>
            <div className="ml-auto flex gap-2">
              <Link
                href={`/counterparties/${counterparty.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil />
                Düzenle
              </Link>
              <DeleteCounterpartyButton counterparty={counterparty} />
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className="rounded-lg border bg-card">
              <h3 className="border-b px-4 py-2.5 text-sm font-medium">
                Bilgiler
              </h3>
              <div className="p-4">
                <InfoFields
                  fields={[
                    { label: "Şehir", value: counterparty.city },
                    { label: "İlçe", value: counterparty.district },
                    { label: "Adres", value: counterparty.address },
                    { label: "Telefon", value: counterparty.phone },
                    { label: "E-posta", value: counterparty.email },
                  ]}
                />
              </div>
            </section>

            <CounterpartyPayments id={counterparty.id} />
          </div>
        </>
      )}
    </div>
  );
}

/** The cari's payments with their count and total */
function CounterpartyPayments({ id }: { id: number }) {
  const filters = { ...NO_PAYMENT_FILTERS, counterparty: id };
  const { data, isError } = useQuery({
    queryKey: ["payments", "list", filters],
    queryFn: () => getPayments(filters),
  });

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
        <Link
          href={`/payments/new?counterparty=${id}`}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "ml-auto",
          })}
        >
          <Plus />
          Ödeme Ekle
        </Link>
      </div>

      {isError ? (
        <p className="p-4 text-sm text-muted-foreground">
          Ödemeler yüklenirken bir hata oluştu.
        </p>
      ) : data && data.payments.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Bu cariye henüz ödeme yapılmamış.
        </p>
      ) : (
        data && (
          <>
            <div className="[&_[data-slot=table-container]]:max-h-[28rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead>Ödeme Türü</TableHead>
                    <TableHead>Ödeme Tipi</TableHead>
                    <TableHead>Not</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Link
                          href={`/payments/${payment.id}/edit?counterparty=${id}`}
                          className="text-primary hover:underline"
                        >
                          {formatDate(payment.date)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(payment.amount)}
                      </TableCell>
                      <TableCell>{payment.categoryName}</TableCell>
                      <TableCell>{payment.methodName}</TableCell>
                      <TableCell>
                        <span className="line-clamp-1 max-w-48 whitespace-normal">
                          {orDash(payment.note)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableTotalFooter
                  columnIds={["date", "amount", "category", "method", "note"]}
                  amountColumnId="amount"
                  amounts={data.payments.map((payment) => payment.amount)}
                  alignRight
                />
              </Table>
            </div>
            <div className="border-t px-4 py-2 text-sm">
              <Link
                href={`/payments?counterparty=${id}`}
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
