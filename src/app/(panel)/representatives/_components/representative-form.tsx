"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  type Control,
  Controller,
  useFieldArray,
  useForm,
  useFormState,
  useWatch,
} from "react-hook-form";
import { SearchCombobox } from "@/components/search-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isoToDisplay } from "@/lib/dates";
import { getMembers, type MemberListItem } from "@/lib/fetches/member";
import {
  createRepresentative,
  type RepresentativeDetails,
  updateRepresentative,
} from "@/lib/fetches/representative";
import { invalidateSmsQueries } from "@/lib/fetches/sms";
import { listHref } from "@/lib/list-href";
import { compareTr } from "@/lib/turkish";
import {
  type RepresentativeFormInput,
  type RepresentativeFormValues,
  representativeFormSchema,
} from "@/lib/zod-schemas/authorized-representative";

const emptyMembers: MemberListItem[] = [];

/**
 * Create form without a yetkili, edit form with one. `fromMemberId` comes
 * from a member page's "Yetkili ekle": that member starts out linked and
 * saving or cancelling returns to it.
 */
export function RepresentativeForm({
  representative,
  fromMemberId,
}: {
  representative?: RepresentativeDetails;
  fromMemberId?: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(representativeFormSchema),
    defaultValues: {
      name: representative?.name ?? "",
      phone: representative?.phone ?? "",
      email: representative?.email ?? "",
      // the API sends yyyy-aa-gg, the form works in gg.aa.yyyy
      dateOfBirth: isoToDisplay(representative?.dateOfBirth),
      notes: representative?.notes ?? "",
      active: representative?.active ?? true,
      members: representative
        ? representative.members.map((m) => ({
            memberId: m.id,
            role: m.role ?? "",
          }))
        : fromMemberId
          ? [{ memberId: fromMemberId, role: "" }]
          : [],
    },
  });
  const { errors } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: RepresentativeFormValues) => {
      if (!representative) return (await createRepresentative(values)).id;
      await updateRepresentative(representative.id, values);
      return representative.id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
        // member pages list their yetkililer
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        invalidateSmsQueries(queryClient),
      ]);
      router.push(
        fromMemberId ? `/members/${fromMemberId}` : `/representatives/${id}`,
      );
    },
  });

  const backHref = fromMemberId
    ? `/members/${fromMemberId}`
    : representative
      ? `/representatives/${representative.id}`
      : listHref("/representatives");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {fromMemberId
          ? "Üyeye dön"
          : representative
            ? "Yetkiliye dön"
            : "Yetkililere dön"}
      </Link>

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {representative ? "Yetkiliyi Düzenle" : "Yeni Yetkili"}
          </h2>

          <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.name} className="sm:col-span-2">
              <FieldLabel htmlFor="name">
                Ad Soyad <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="name"
                autoComplete="off"
                autoFocus
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="phone">Cep Telefonu</FieldLabel>
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

            <Controller
              control={form.control}
              name="dateOfBirth"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="dateOfBirth">Doğum Tarihi</FieldLabel>
                  <DatePickerInput
                    id="dateOfBirth"
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
              name="active"
              render={({ field }) => (
                <Field orientation="horizontal" className="self-start sm:pt-7">
                  <Checkbox
                    id="active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="active" className="font-normal">
                    Aktif yetkili
                  </FieldLabel>
                </Field>
              )}
            />

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="notes">Notlar</FieldLabel>
              <Textarea id="notes" rows={3} {...form.register("notes")} />
            </Field>
          </div>
        </section>

        <MemberLinks control={form.control} />

        <div className="flex items-center justify-end gap-3">
          {error && (
            <FieldError className="mr-auto">{error.message}</FieldError>
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

/** "Bağlı Üyeler": one row per linked member with the yetkili's görev there */
function MemberLinks({
  control,
}: {
  control: Control<RepresentativeFormInput, unknown, RepresentativeFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "members",
  });
  const links = useWatch({ control, name: "members" });
  const { errors } = useFormState({ control, name: "members" });

  const { data: members = emptyMembers } = useQuery({
    queryKey: ["members"],
    queryFn: () => getMembers(),
  });
  const memberItems = useMemo(
    () =>
      members
        .map((m) => ({
          value: m.id,
          label: m.active ? m.title : `${m.title} (Pasif)`,
        }))
        .toSorted((a, b) => compareTr(a.label, b.label)),
    [members],
  );

  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-medium">Bağlı Üyeler</h2>

      <div className="flex flex-col gap-3 p-4">
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Bu yetkili henüz bir üyeye bağlı değil.
          </p>
        )}

        {fields.length > 0 && (
          <div className="hidden grid-cols-[1fr_1fr_auto] gap-3 text-sm font-medium sm:grid">
            <span>Üye</span>
            <span>Görev</span>
            <span className="w-8" />
          </div>
        )}

        {fields.map((field, index) => {
          // a member already picked in another row can't be picked again
          const takenIds = new Set(
            links
              .filter((_, other) => other !== index)
              .map((link) => link.memberId),
          );
          const items = memberItems.filter((item) => !takenIds.has(item.value));

          return (
            <div
              key={field.id}
              className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Controller
                control={control}
                name={`members.${index}.memberId`}
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <SearchCombobox
                      id={`members-${index}-member`}
                      items={items}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!fieldState.error}
                      placeholder="Üye seçin"
                      noItemsText="Seçilebilecek üye yok."
                      noMatchText="Aramanızla eşleşen üye yok."
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`members.${index}.role`}
                render={({ field }) => (
                  <Input
                    aria-label="Görev"
                    placeholder="Görev, ör. Genel Müdür"
                    autoComplete="off"
                    {...field}
                  />
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Üye bağlantısını kaldır"
                className="text-muted-foreground"
                onClick={() => remove(index)}
              >
                <X />
              </Button>
            </div>
          );
        })}

        <FieldError errors={[errors.members?.root ?? errors.members]} />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => append({ memberId: null, role: "" })}
        >
          <Plus />
          Üye ekle
        </Button>
      </div>
    </section>
  );
}
