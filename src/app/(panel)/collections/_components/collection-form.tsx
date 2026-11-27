"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { AmountInput } from "@/components/amount-input";
import { CashAccountSection } from "@/components/cash-account-section";
import { SearchCombobox } from "@/components/search-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useMemberItems } from "@/components/use-member-items";
import { initialCashAccountId } from "@/lib/cash-account-items";
import { isoToDisplay, todayInIstanbul } from "@/lib/dates";
import {
  type CashAccountListItem,
  getCashAccounts,
} from "@/lib/fetches/cash-account";
import {
  type Collection,
  createCollection,
  updateCollection,
} from "@/lib/fetches/collection";
import { ApiError } from "@/lib/fetches/errors";
import { getMembers } from "@/lib/fetches/member";
import { getParameters, type Parameter } from "@/lib/fetches/parameter";
import { getProjects, type ProjectListItem } from "@/lib/fetches/project";
import { listHref } from "@/lib/list-href";
import { amountToInput } from "@/lib/money";
import type { ParameterKind } from "@/lib/parameters";
import {
  type CollectionFormInput,
  type CollectionFormValues,
  collectionFormSchema,
} from "@/lib/zod-schemas/collection";
import { DeleteCollectionButton } from "../[id]/edit/delete-collection-button";
import { MissingPrerequisitesNotice } from "./missing-prerequisites-notice";
import { ProjectSection } from "./project-section";

const emptyParameters: Parameter[] = [];
const emptyProjects: ProjectListItem[] = [];
const emptyCashAccounts: CashAccountListItem[] = [];

// API field names the form can show an error under
const FIELDS = new Set([
  "memberId",
  "categoryId",
  "cashAccountId",
  "amount",
  "date",
  "note",
  "project.id",
  "project.name",
  "project.number",
]);

function itemsOf(parameters: Parameter[], kind: ParameterKind) {
  return parameters
    .filter((p) => p.kind === kind)
    .map((p) => ({ value: p.id, label: p.name }));
}

/**
 * Create form without a tahsilat, edit form with one. `from` is the üye,
 * proje or Kasa - Banka page it was opened from: that one is preselected (when it can
 * be picked) and saving or cancelling returns there.
 */
export function CollectionForm({
  collection,
  from,
}: {
  collection?: Collection;
  from?: { member?: number; project?: number; cashAccount?: number };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: loadedMembers } = useQuery({
    queryKey: ["members"],
    queryFn: () => getMembers(),
  });
  const { data: loadedParameters } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });
  const { data: projects = emptyProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const { data: loadedCashAccounts } = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => getCashAccounts(),
  });
  const cashAccounts = loadedCashAccounts ?? emptyCashAccounts;
  const parameters = loadedParameters ?? emptyParameters;

  // Aktif members, plus the tahsilat's own member when editing
  const memberItems = useMemberItems(collection ? [collection.memberId] : []);
  const categoryItems = useMemo(
    () => itemsOf(parameters, "collection_category"),
    [parameters],
  );

  // a `?member=` / `?project=` that can't be picked preselects nothing
  const fromMember = memberItems.some((r) => r.value === from?.member)
    ? (from?.member ?? null)
    : null;
  const fromProject = projects.some((p) => p.id === from?.project && p.active)
    ? (from?.project ?? null)
    : null;

  const initialProjectId = collection ? collection.projectId : fromProject;

  const form = useForm<CollectionFormInput, unknown, CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: {
      memberId: collection?.memberId ?? fromMember,
      categoryId: collection?.categoryId ?? null,
      cashAccountId: initialCashAccountId(
        cashAccounts,
        collection?.cashAccountId,
        from?.cashAccount,
      ),
      amount: collection ? amountToInput(collection.amount) : "",
      date: isoToDisplay(collection?.date ?? todayInIstanbul()),
      note: collection?.note ?? "",
      project: {
        mode: initialProjectId === null ? "none" : "existing",
        id: initialProjectId,
        name: "",
        number: "",
        active: true,
      },
    },
  });
  // the Kasa - Banka section shows the Bakiye of this date's period
  const date = useWatch({ control: form.control, name: "date" });

  const backHref = from?.member
    ? `/members/${from.member}`
    : from?.project
      ? `/projects/${from.project}`
      : from?.cashAccount
        ? `/cash-accounts/${from.cashAccount}`
        : listHref("/collections");

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: CollectionFormValues) => {
      if (!collection) return void (await createCollection(values));
      await updateCollection(collection.id, values);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        // projeler show totals and may be new; üyeler show their count
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
        // the account's Bakiye moves
        queryClient.invalidateQueries({ queryKey: ["cash-accounts"] }),
      ]);
      router.push(backHref);
    },
    // e.g. "Bu proje numarası zaten var" under Proje Numarası
    onError: (error) => {
      if (error instanceof ApiError && error.field && FIELDS.has(error.field)) {
        form.setError(error.field as FieldPath<CollectionFormInput>, {
          message: error.message,
        });
      }
    },
  });
  const formError =
    error &&
    !(error instanceof ApiError && error.field && FIELDS.has(error.field))
      ? error
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {from?.member
          ? "Üyeye dön"
          : from?.project
            ? "Projeye dön"
            : from?.cashAccount
              ? "Hesaba dön"
              : "Tahsilatlara dön"}
      </Link>

      <MissingPrerequisitesNotice
        members={loadedMembers}
        parameters={loadedParameters}
        cashAccounts={loadedCashAccounts}
      />

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {collection ? "Tahsilatı Düzenle" : "Yeni Tahsilat"}
          </h2>

          <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="memberId"
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={!!fieldState.error}
                  className="sm:col-span-2"
                >
                  <Required htmlFor="memberId">Üye</Required>
                  <SearchCombobox
                    id="memberId"
                    items={memberItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Üye seçin"
                    noItemsText="Aktif üye yok."
                    noMatchText="Aramanızla eşleşen üye yok."
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
                  <Required htmlFor="categoryId">Tahsilat Türü</Required>
                  <SearchCombobox
                    id="categoryId"
                    items={categoryItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Tahsilat türü seçin"
                    noItemsText="Ayarlar'da tahsilat türü yok."
                    noMatchText="Aramanızla eşleşen tahsilat türü yok."
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

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="note">Not</FieldLabel>
              <Textarea id="note" rows={3} {...form.register("note")} />
            </Field>
          </div>
        </section>

        <Controller
          control={form.control}
          name="cashAccountId"
          render={({ field, fieldState }) => (
            <CashAccountSection
              accounts={cashAccounts}
              currentId={collection?.cashAccountId ?? null}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error}
              date={date}
            />
          )}
        />

        <ProjectSection
          control={form.control}
          projects={projects}
          currentProjectId={collection?.projectId ?? null}
        />

        <div className="flex items-center justify-end gap-3">
          {collection && (
            <div className="mr-auto">
              <DeleteCollectionButton
                collection={collection}
                backHref={backHref}
              />
            </div>
          )}
          {formError && <FieldError>{formError.message}</FieldError>}
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
