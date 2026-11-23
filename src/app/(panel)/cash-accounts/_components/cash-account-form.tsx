"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, type Path, useForm } from "react-hook-form";
import { AmountInput } from "@/components/amount-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

const FIELDS = ["name", "openingBalance", "active"];

/** The input an API error is about, when the form shows that input */
function formField(error: unknown) {
  if (!(error instanceof ApiError) || !error.field) return null;
  return FIELDS.includes(error.field)
    ? (error.field as Path<CashAccountFormInput>)
    : null;
}

/** Create form without an account, edit form with one */
export function CashAccountForm({ account }: { account?: CashAccount }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(cashAccountFormSchema),
    defaultValues: {
      name: account?.name ?? "",
      openingBalance:
        account && account.openingBalance !== "0.00"
          ? amountToInput(account.openingBalance)
          : "",
      active: account?.active ?? true,
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
              name="openingBalance"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="openingBalance">
                    Başlangıç Bakiyesi
                  </FieldLabel>
                  <AmountInput
                    id="openingBalance"
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!fieldState.error}
                    allowNegative
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

            <p className="text-sm text-muted-foreground sm:col-span-2">
              Boş bırakılırsa 0 olur. Bakiye, bu tutara hesabın tahsilatları
              eklenip ödemeleri çıkarılarak hesaplanır.
            </p>
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
