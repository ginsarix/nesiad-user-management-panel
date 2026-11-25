"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, type Path, useForm } from "react-hook-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isoToDisplay, todayInIstanbul } from "@/lib/dates";
import {
  type CashAccount,
  createCashAccount,
  updateCashAccount,
} from "@/lib/fetches/cash-account";
import { ApiError } from "@/lib/fetches/errors";
import { listHref } from "@/lib/list-href";
import { amountToInput } from "@/lib/money";
import {
  type CashAccountFormInput,
  type CashAccountFormValues,
  cashAccountFormSchema,
  cashAccountToApi,
} from "@/lib/zod-schemas/cash-account";
import { PeriodsEditor } from "./periods-editor";

/** The input an API error is about, when the form shows that input */
function formField(error: unknown) {
  if (!(error instanceof ApiError) || !error.field) return null;
  // e.g. "periods.1.startDate", or "periods" for the whole list
  if (error.field === "name" || error.field.startsWith("periods")) {
    return error.field as Path<CashAccountFormInput>;
  }
  return null;
}

/** A new account starts with one period from 01.01 of this year */
function newAccountPeriods() {
  return [
    {
      startDate: isoToDisplay(`${todayInIstanbul().slice(0, 4)}-01-01`),
      openingBalance: "",
    },
  ];
}

/** Create form without an account, edit form with one */
export function CashAccountForm({ account }: { account?: CashAccount }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<CashAccountFormInput, unknown, CashAccountFormValues>({
    resolver: zodResolver(cashAccountFormSchema),
    defaultValues: {
      name: account?.name ?? "",
      active: account?.active ?? true,
      periods: account
        ? account.periods.map((period) => ({
            id: period.id,
            startDate: isoToDisplay(period.startDate),
            openingBalance:
              period.openingBalance === "0.00"
                ? ""
                : amountToInput(period.openingBalance),
          }))
        : newAccountPeriods(),
    },
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: CashAccountFormValues) => {
      const json = cashAccountToApi(values);
      if (!account) return await createCashAccount(json);
      await updateCashAccount(account.id, json);
      return account.id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cash-accounts"] }),
        // ödemeler and tahsilatlar show the account's name
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      router.push(`/cash-accounts/${id}`);
    },
    // e.g. "Bu isimde bir Kasa - Banka zaten var" under İsim
    onError: (error) => {
      const field = formField(error);
      if (field) form.setError(field, { message: error.message });
    },
  });
  const formError = error && !formField(error) ? error : null;

  const backHref = account
    ? `/cash-accounts/${account.id}`
    : listHref("/cash-accounts");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {account ? "Hesaba dön" : "Kasa - Banka listesine dön"}
      </Link>

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {account ? "Kasa - Banka Düzenle" : "Yeni Kasa - Banka"}
          </h2>
          <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={!!fieldState.error}
                  className="sm:col-span-2"
                >
                  <FieldLabel htmlFor="name">
                    İsim <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="name"
                    autoComplete="off"
                    placeholder="ör. Merkez Kasa, Ziraat Bankası Vadesiz"
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Field orientation="horizontal" className="self-end sm:pb-2">
                  <Checkbox
                    id="active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="active" className="font-normal">
                    Aktif hesap
                  </FieldLabel>
                </Field>
              )}
            />
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">Dönemler</h2>
          <div className="p-4">
            <PeriodsEditor control={form.control} />
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
