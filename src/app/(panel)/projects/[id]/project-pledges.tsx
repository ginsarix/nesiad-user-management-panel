"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Path, useForm } from "react-hook-form";
import { PledgesEditor } from "@/components/pledges-editor";
import { SaveBar } from "@/components/save-bar";
import { ApiError } from "@/lib/fetches/errors";
import { type Project, savePledges } from "@/lib/fetches/project";
import {
  type PledgesFormInput,
  type PledgesFormValues,
  pledgesFormSchema,
  pledgesToApi,
  pledgesToForm,
} from "@/lib/zod-schemas/project";

const PLEDGE_FIELD = /^pledges\.\d+\.(representativeId|quantity|amount)$/;

/** The taahhüt input an API error is about, if any */
function pledgeField(error: unknown) {
  return error instanceof ApiError &&
    error.field &&
    PLEDGE_FIELD.test(error.field)
    ? (error.field as Path<PledgesFormInput>)
    : null;
}

/**
 * The details page's Taahhütler, edited in place: totals follow what is
 * typed, nothing is saved until Kaydet in the bar that appears while there
 * are changes, and leaving the page is stopped until then.
 */
export function ProjectPledges({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const form = useForm({
    resolver: zodResolver(pledgesFormSchema),
    defaultValues: { pledges: pledgesToForm(project.pledges) },
  });

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: (values: PledgesFormValues) =>
      savePledges(project.id, pledgesToApi(values.pledges)),
    onSuccess: (_, values) => {
      // what was sent is what the server stored: the form's new starting
      // point, without waiting for (or depending on) the refetch below
      form.reset({
        pledges: pledgesToForm(pledgesToApi(values.pledges)),
      });
      setSavedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      // yetkili pages count taahhütler (the delete check)
      void queryClient.invalidateQueries({ queryKey: ["representatives"] });
    },
    // e.g. "Pasif yetkili eklenemez" under that row's Yetkili
    onError: (error) => {
      const field = pledgeField(error);
      if (field) form.setError(field, { message: error.message });
    },
  });

  return (
    <form onSubmit={form.handleSubmit((values) => mutate(values))} noValidate>
      <section className="rounded-lg border bg-card">
        <h3 className="border-b px-4 py-2.5 text-sm font-medium">Taahhütler</h3>
        {/* nothing typed while saving, so the reset after it loses nothing */}
        <fieldset disabled={isPending} className="p-4">
          <PledgesEditor
            control={form.control}
            setValue={form.setValue}
            getValues={form.getValues}
            current={project.pledges}
          />
        </fieldset>
      </section>

      <SaveBar
        dirty={form.formState.isDirty}
        saving={isPending}
        error={error && !pledgeField(error) ? error : null}
        savedAt={savedAt}
        savedText="Taahhütler kaydedildi"
        onDiscard={() => {
          form.reset();
          reset();
        }}
      />
    </form>
  );
}
