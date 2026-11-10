"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { AmountInput } from "@/components/amount-input";
import { SearchCombobox } from "@/components/search-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { isoToDisplay, todayInIstanbul } from "@/lib/dates";
import {
  type CounterpartyListItem,
  getCounterparties,
} from "@/lib/fetches/counterparty";
import { getParameters, type Parameter } from "@/lib/fetches/parameter";
import {
  createPayment,
  type Payment,
  updatePayment,
} from "@/lib/fetches/payment";
import { listHref } from "@/lib/list-href";
import { amountToInput } from "@/lib/money";
import type { ParameterKind } from "@/lib/parameters";
import {
  type PaymentFormValues,
  paymentFormSchema,
} from "@/lib/zod-schemas/payment";
import { DeletePaymentButton } from "../[id]/edit/delete-payment-button";
import { MissingPrerequisitesNotice } from "./missing-prerequisites-notice";

const emptyCounterparties: CounterpartyListItem[] = [];
const emptyParameters: Parameter[] = [];

function itemsOf(parameters: Parameter[], kind: ParameterKind) {
  // the API sorts them by name
  return parameters
    .filter((p) => p.kind === kind)
    .map((p) => ({ value: p.id, label: p.name }));
}

/**
 * Create form without a payment, edit form with one. `fromCounterpartyId`
 * comes from a cari page: that cari is preselected and saving or cancelling
 * returns to it.
 */
export function PaymentForm({
  payment,
  fromCounterpartyId,
}: {
  payment?: Payment;
  fromCounterpartyId?: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: loadedCounterparties } = useQuery({
    queryKey: ["counterparties"],
    queryFn: () => getCounterparties(),
  });
  const { data: loadedParameters } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });
  const counterparties = loadedCounterparties ?? emptyCounterparties;
  const parameters = loadedParameters ?? emptyParameters;
  const counterpartyItems = useMemo(
    () => counterparties.map((c) => ({ value: c.id, label: c.title })),
    [counterparties],
  );
  const categoryItems = useMemo(
    () => itemsOf(parameters, "payment_category"),
    [parameters],
  );
  const methodItems = useMemo(
    () => itemsOf(parameters, "payment_method"),
    [parameters],
  );

  const form = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      counterpartyId:
        payment?.counterpartyId ??
        // a stale `?counterparty=` link preselects nothing
        (counterparties.some((c) => c.id === fromCounterpartyId)
          ? (fromCounterpartyId ?? null)
          : null),
      amount: payment ? amountToInput(payment.amount) : "",
      date: isoToDisplay(payment?.date ?? todayInIstanbul()),
      categoryId: payment?.categoryId ?? null,
      methodId: payment?.methodId ?? null,
      note: payment?.note ?? "",
    },
  });

  const backHref = fromCounterpartyId
    ? `/counterparties/${fromCounterpartyId}`
    : listHref("/payments");

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!payment) return void (await createPayment(values));
      await updatePayment(payment.id, values);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        // cariler show their total, parameters their payment count
        queryClient.invalidateQueries({ queryKey: ["counterparties"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
      ]);
      router.push(backHref);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {fromCounterpartyId ? "Cariye dön" : "Ödemelere dön"}
      </Link>

      <MissingPrerequisitesNotice
        counterparties={loadedCounterparties}
        parameters={loadedParameters}
      />

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {payment ? "Ödemeyi Düzenle" : "Yeni Ödeme"}
          </h2>

          <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="counterpartyId"
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={!!fieldState.error}
                  className="sm:col-span-2"
                >
                  <Required htmlFor="counterpartyId">
                    Ödeme Yapılan Cari
                  </Required>
                  <SearchCombobox
                    id="counterpartyId"
                    items={counterpartyItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Cari seçin"
                    noItemsText="Henüz cari eklenmemiş."
                    noMatchText="Aramanızla eşleşen cari yok."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="amount"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <Required htmlFor="amount">Tutar</Required>
                  <AmountInput
                    id="amount"
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!fieldState.error}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="date"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <Required htmlFor="date">Tarih</Required>
                  <DatePickerInput
                    id="date"
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!fieldState.error}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="categoryId"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <Required htmlFor="categoryId">Ödeme Türü</Required>
                  <SearchCombobox
                    id="categoryId"
                    items={categoryItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Ödeme türü seçin"
                    noItemsText="Ayarlar'da ödeme türü yok."
                    noMatchText="Aramanızla eşleşen ödeme türü yok."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="methodId"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <Required htmlFor="methodId">Ödeme Tipi</Required>
                  <SearchCombobox
                    id="methodId"
                    items={methodItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Ödeme tipi seçin"
                    noItemsText="Ayarlar'da ödeme tipi yok."
                    noMatchText="Aramanızla eşleşen ödeme tipi yok."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="note">Not</FieldLabel>
              <Textarea id="note" rows={3} {...form.register("note")} />
            </Field>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          {payment && (
            <div className="mr-auto">
              <DeletePaymentButton payment={payment} backHref={backHref} />
            </div>
          )}
          {error && <FieldError>{error.message}</FieldError>}
          <Link
            href={backHref}
            className={buttonVariants({ variant: "ghost" })}
          >
            İptal
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Required({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {children} <span className="text-destructive">*</span>
    </FieldLabel>
  );
}
