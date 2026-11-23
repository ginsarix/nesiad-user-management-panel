"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { InfoFields } from "@/components/info-fields";
import { PaymentsSection } from "@/components/payments-section";
import { buttonVariants } from "@/components/ui/button";
import { getCounterparty } from "@/lib/fetches/counterparty";
import { listHref } from "@/lib/list-href";
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

            <PaymentsSection of="counterparty" id={counterparty.id} />
          </div>
        </>
      )}
    </div>
  );
}
