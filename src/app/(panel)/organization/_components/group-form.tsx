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
} from "react-hook-form";
import { SearchCombobox } from "@/components/search-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/fetches/errors";
import {
  createOrganizationGroup,
  type OrganizationGroup,
  updateOrganizationGroup,
} from "@/lib/fetches/organization";
import { getParameters, type Parameter } from "@/lib/fetches/parameter";
import {
  getRepresentatives,
  type RepresentativeListItem,
} from "@/lib/fetches/representative";
import { listHref } from "@/lib/list-href";
import {
  ORGANIZATION_INFO,
  type Organization,
  organizationHref,
} from "@/lib/organizations";
import { compareTr } from "@/lib/turkish";
import {
  type OrganizationGroupFormInput,
  type OrganizationGroupFormValues,
  organizationGroupFormSchema,
} from "@/lib/zod-schemas/organization";

const emptyRepresentatives: RepresentativeListItem[] = [];
const emptyParameters: Parameter[] = [];

/** Create form without a group, edit form with one */
export function GroupForm({
  organization,
  group,
}: {
  organization: Organization;
  group?: OrganizationGroup;
}) {
  const info = ORGANIZATION_INFO[organization];
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(organizationGroupFormSchema),
    defaultValues: {
      name: group?.name ?? "",
      people:
        group?.people.map((person) => ({
          representativeId: person.representativeId,
          roleId: person.roleId,
        })) ?? [],
    },
  });
  const { errors } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: OrganizationGroupFormValues) => {
      if (!group) return await createOrganizationGroup(organization, values);
      await updateOrganizationGroup(organization, group.id, values);
      return group.id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        // yetkili pages list their groups, Parametreler counts görev usage
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
      ]);
      router.push(organizationHref(organization, String(id)));
    },
    // "Bu isimde bir kayıt zaten var" under İsim
    onError: (error) => {
      if (error instanceof ApiError && error.field === "name") {
        form.setError("name", { message: error.message });
      }
    },
  });
  const formError =
    error && !(error instanceof ApiError && error.field === "name")
      ? error
      : null;

  const backHref = group
    ? organizationHref(organization, String(group.id))
    : listHref(organizationHref(organization));

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {group ? `${info.singular} sayfasına dön` : info.backLabel}
      </Link>

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {group ? `${info.singular} Düzenle` : `Yeni ${info.singular}`}
          </h2>
          <div className="p-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">
                İsim <span className="text-destructive">*</span>
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
          </div>
        </section>

        <People control={form.control} group={group} />

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

/** "Kişiler": one row per person, a yetkili and their Dernek Görevi */
function People({
  control,
  group,
}: {
  control: Control<
    OrganizationGroupFormInput,
    unknown,
    OrganizationGroupFormValues
  >;
  group?: OrganizationGroup;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "people",
  });
  const { errors } = useFormState({ control, name: "people" });

  const { data: representatives = emptyRepresentatives } = useQuery({
    queryKey: ["representatives"],
    queryFn: () => getRepresentatives(),
  });
  const { data: parameters, isSuccess: parametersLoaded } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });

  // Aktif yetkililer, plus Pasif ones already in the group: they stay
  const representativeItems = useMemo(() => {
    const currentIds = new Set(
      group?.people.map((person) => person.representativeId),
    );
    return representatives
      .filter((r) => r.active || currentIds.has(r.id))
      .map((r) => ({
        value: r.id,
        label: r.active ? r.name : `${r.name} (Pasif)`,
      }))
      .toSorted((a, b) => compareTr(a.label, b.label));
  }, [representatives, group]);

  const roleItems = useMemo(
    () =>
      (parameters ?? emptyParameters)
        .filter((p) => p.kind === "association_role")
        .map((p) => ({ value: p.id, label: p.name })),
    [parameters],
  );

  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-medium">Kişiler</h2>

      <div className="flex flex-col gap-3 p-4">
        {parametersLoaded && roleItems.length === 0 && (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            Kişi eklemek için önce{" "}
            <Link href="/settings" className="font-medium underline">
              Ayarlar → Parametreler
            </Link>
            'de dernek görevi ekleyin.
          </p>
        )}

        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Henüz kişi eklenmemiş.
          </p>
        )}

        {fields.length > 0 && (
          <div className="hidden grid-cols-[1fr_1fr_auto] gap-3 text-sm font-medium sm:grid">
            <span>Yetkili</span>
            <span>Görev</span>
            <span className="w-8" />
          </div>
        )}

        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <Controller
              control={control}
              name={`people.${index}.representativeId`}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <SearchCombobox
                    id={`people-${index}-representative`}
                    items={representativeItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Yetkili seçin"
                    noItemsText="Seçilebilecek yetkili yok."
                    noMatchText="Aramanızla eşleşen yetkili yok."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name={`people.${index}.roleId`}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <SearchCombobox
                    id={`people-${index}-role`}
                    items={roleItems}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!fieldState.error}
                    placeholder="Görev seçin"
                    noItemsText="Ayarlar'da dernek görevi yok."
                    noMatchText="Aramanızla eşleşen görev yok."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Kişiyi kaldır"
              className="text-muted-foreground"
              onClick={() => remove(index)}
            >
              <X />
            </Button>
          </div>
        ))}

        <FieldError errors={[errors.people?.root ?? errors.people]} />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => append({ representativeId: null, roleId: null })}
        >
          <Plus />
          Kişi ekle
        </Button>
      </div>
    </section>
  );
}
