"use client";

import { useMemo } from "react";
import { type Control, Controller, useWatch } from "react-hook-form";
import { ProjectFields } from "@/components/project-fields";
import { SearchCombobox } from "@/components/search-combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ProjectListItem } from "@/lib/fetches/project";
import { projectLabel } from "@/lib/projects";
import type {
  CollectionFormInput,
  CollectionFormValues,
  ProjectMode,
} from "@/lib/zod-schemas/collection";

const MODES: { value: ProjectMode; label: string }[] = [
  { value: "none", label: "Projesiz" },
  { value: "existing", label: "Mevcut proje" },
  { value: "new", label: "Yeni proje" },
];

/**
 * The tahsilat's proje: none, an existing Aktif one, or a new one saved
 * with the tahsilat. `currentProjectId` keeps the linked proje pickable on
 * edit even if it has become Pasif.
 */
export function ProjectSection({
  control,
  projects,
  currentProjectId,
}: {
  control: Control<CollectionFormInput, unknown, CollectionFormValues>;
  projects: ProjectListItem[];
  currentProjectId: number | null;
}) {
  const mode = useWatch({ control, name: "project.mode" });
  const items = useMemo(
    () =>
      projects
        .filter((p) => p.active || p.id === currentProjectId)
        .map((p) => ({
          value: p.id,
          label: p.active ? projectLabel(p) : `${projectLabel(p)} (Pasif)`,
        })),
    [projects, currentProjectId],
  );

  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-medium">Proje</h2>
      <div className="flex flex-col gap-4 p-4">
        <Controller
          control={control}
          name="project.mode"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={(value) => field.onChange(value as ProjectMode)}
              className="flex flex-wrap gap-x-6 gap-y-2"
              aria-label="Proje"
            >
              {MODES.map((item) => (
                <Field
                  key={item.value}
                  orientation="horizontal"
                  className="w-auto"
                >
                  <RadioGroupItem
                    id={`project-mode-${item.value}`}
                    value={item.value}
                  />
                  <FieldLabel
                    htmlFor={`project-mode-${item.value}`}
                    className="font-normal"
                  >
                    {item.label}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          )}
        />

        {mode === "existing" && (
          <Controller
            control={control}
            name="project.id"
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error} className="max-w-md">
                <FieldLabel htmlFor="project-id">
                  Proje <span className="text-destructive">*</span>
                </FieldLabel>
                <SearchCombobox
                  id="project-id"
                  items={items}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!fieldState.error}
                  placeholder="Proje seçin"
                  noItemsText="Aktif proje yok."
                  noMatchText="Aramanızla eşleşen proje yok."
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}

        {mode === "new" && (
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <ProjectFields control={control} prefix="project." />
          </div>
        )}
      </div>
    </section>
  );
}
