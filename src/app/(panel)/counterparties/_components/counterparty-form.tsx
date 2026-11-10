"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { LocationFields } from "@/components/location-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type Counterparty,
  createCounterparty,
  updateCounterparty,
} from "@/lib/fetches/counterparty";
import { ApiError } from "@/lib/fetches/errors";
import { listHref } from "@/lib/list-href";
import {
  type CounterpartyFormValues,
  counterpartyFormSchema,
} from "@/lib/zod-schemas/counterparty";

const FIELDS = ["title", "city", "district", "address", "phone", "email"];

/** Create form without a cari, edit form with one */
export function CounterpartyForm({
  counterparty,
}: {
  counterparty?: Counterparty;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(counterpartyFormSchema),
    defaultValues: {
      title: counterparty?.title ?? "",
      city: counterparty?.city ?? "",
      district: counterparty?.district ?? "",
      address: counterparty?.address ?? "",
      phone: counterparty?.phone ?? "",
      email: counterparty?.email ?? "",
    },
  });
  const { errors } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: CounterpartyFormValues) => {
      if (!counterparty) return await createCounterparty(values);
      await updateCounterparty(counterparty.id, values);
      return counterparty.id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counterparties"] }),
        // payments show the cari's Ünvan
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
      ]);
      router.push(`/counterparties/${id}`);
    },
    // e.g. "Bu ünvanla bir cari zaten var" under Ünvan
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.field &&
        FIELDS.includes(error.field)
      ) {
        form.setError(error.field as keyof CounterpartyFormValues, {
          message: error.message,
        });
      }
    },
  });
  // shown at the bottom only when no input took it
  const formError =
    error && !(error instanceof ApiError && error.field) ? error : null;

  const backHref = counterparty
    ? `/counterparties/${counterparty.id}`
    : listHref("/counterparties");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {counterparty ? "Cariye dön" : "Carilere dön"}
      </Link>

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {counterparty ? "Cariyi Düzenle" : "Yeni Cari"}
          </h2>

          <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.title} className="sm:col-span-2">
              <FieldLabel htmlFor="title">
                Ünvan <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="title"
                autoComplete="off"
                autoFocus
                aria-invalid={!!errors.title}
                {...form.register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <LocationFields
              control={form.control}
              cityName="city"
              districtName="district"
            />

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="address">Adres</FieldLabel>
              <Textarea id="address" rows={3} {...form.register("address")} />
            </Field>

            <Field>
              <FieldLabel htmlFor="phone">Telefon</FieldLabel>
              <Input
                id="phone"
                type="tel"
                autoComplete="off"
                {...form.register("phone")}
              />
            </Field>

            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">E-posta</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          {formError && (
            <FieldError className="mr-auto">{formError.message}</FieldError>
          )}
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
