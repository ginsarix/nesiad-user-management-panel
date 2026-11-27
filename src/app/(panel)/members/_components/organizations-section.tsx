"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  Controller,
  useFieldArray,
  useFormState,
  useWatch,
} from "react-hook-form";
import { SearchCombobox } from "@/components/search-combobox";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { getOrganizationGroups } from "@/lib/fetches/organization";
import { getParameters, type Parameter } from "@/lib/fetches/parameter";
import {
  ORGANIZATION_INFO,
  ORGANIZATIONS,
  type Organization,
} from "@/lib/organizations";
import type { MemberFormApi } from "./form-fields";

const emptyParameters: Parameter[] = [];

/**
 * Organizasyonlar: one row per group row, Organizasyon › Grup › Dernek
 * Görevi. Saving touches only this member's rows: a kept row keeps its
 * place, a new or moved one goes to the end of its group.
 */
export function OrganizationsSection({ form }: { form: MemberFormApi }) {
  const { control, setValue } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "organizations",
  });
  const rows = useWatch({ control, name: "organizations" });
  const { errors } = useFormState({ control, name: "organizations" });

  const groupLists = useQueries({
    queries: ORGANIZATIONS.map((organization) => ({
      queryKey: ["organizations", organization],
      queryFn: () => getOrganizationGroups(organization),
    })),
  });
  const { data: parameters, isSuccess: parametersLoaded } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });

  // the picker's values are numbers: an organization's place in ORGANIZATIONS
  const organizationItems = ORGANIZATIONS.map((organization, index) => ({
    value: index,
    label: ORGANIZATION_INFO[organization].title,
  }));
  const groupItemsOf = (organization: Organization | null) => {
    if (organization === null) return [];
    const groups = groupLists[ORGANIZATIONS.indexOf(organization)].data ?? [];
    return groups.map((group) => ({ value: group.id, label: group.name }));
  };
  const roleItems = useMemo(
    () =>
      (parameters ?? emptyParameters)
        .filter((p) => p.kind === "association_role")
        .map((p) => ({ value: p.id, label: p.name })),
    [parameters],
  );

  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-medium">
        Organizasyonlar
      </h2>

      <div className="flex flex-col gap-3 p-4">
        {parametersLoaded && roleItems.length === 0 && (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            Organizasyon eklemek için önce{" "}
            <Link href="/settings" className="font-medium underline">
              Ayarlar → Parametreler
            </Link>
            'de dernek görevi ekleyin.
          </p>
        )}

        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Bu üye henüz bir organizasyonda yer almıyor.
          </p>
        )}

        {fields.length > 0 && (
          <div className="hidden grid-cols-[10rem_1fr_12rem_auto] gap-3 text-sm font-medium sm:grid">
            <span>Organizasyon</span>
            <span>Grup</span>
            <span>Dernek Görevi</span>
            <span className="w-8" />
          </div>
        )}

        {fields.map((field, index) => {
          const organization = rows[index]?.organization ?? null;

          return (
            <div
              key={field.id}
              className="grid items-start gap-3 sm:grid-cols-[10rem_1fr_12rem_auto]"
            >
              <Controller
                control={control}
                name={`organizations.${index}.organization`}
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <SearchCombobox
                      id={`organizations-${index}-organization`}
                      items={organizationItems}
                      value={
                        field.value === null
                          ? null
                          : ORGANIZATIONS.indexOf(field.value)
                      }
                      onChange={(value) => {
                        const next =
                          value === null ? null : ORGANIZATIONS[value];
                        if (next === field.value) return;
                        field.onChange(next);
                        // another page's groups, and a saved row belongs
                        // to its own page: this is now a new row
                        setValue(`organizations.${index}.groupId`, null);
                        setValue(`organizations.${index}.rowId`, null);
                      }}
                      onBlur={field.onBlur}
                      invalid={!!fieldState.error}
                      placeholder="Organizasyon seçin"
                      noItemsText="Organizasyon yok."
                      noMatchText="Aramanızla eşleşen organizasyon yok."
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`organizations.${index}.groupId`}
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <SearchCombobox
                      id={`organizations-${index}-group`}
                      items={groupItemsOf(organization)}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!fieldState.error}
                      disabled={organization === null}
                      placeholder={
                        organization === null
                          ? "Önce organizasyon seçin"
                          : "Grup seçin"
                      }
                      noItemsText="Bu organizasyonda grup yok."
                      noMatchText="Aramanızla eşleşen grup yok."
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`organizations.${index}.roleId`}
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <SearchCombobox
                      id={`organizations-${index}-role`}
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
                aria-label="Organizasyon satırını kaldır"
                className="text-muted-foreground"
                onClick={() => remove(index)}
              >
                <X />
              </Button>
            </div>
          );
        })}

        <FieldError errors={[errors.organizations?.root]} />

        {fields.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Yeni eklenen üye, grubun listesinin sonuna eklenir.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() =>
            append({
              rowId: null,
              organization: null,
              groupId: null,
              roleId: null,
            })
          }
        >
          <Plus />
          Organizasyon ekle
        </Button>
      </div>
    </section>
  );
}
