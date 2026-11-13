"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type Path, useForm } from "react-hook-form";
import { SaveBar } from "@/components/save-bar";
import {
  type Accruals as AccrualList,
  getAccruals,
  saveAccruals,
} from "@/lib/fetches/accrual";
import { ApiError } from "@/lib/fetches/errors";
import {
  type AccrualFormInput,
  type AccrualFormValues,
  accrualFormSchema,
  accrualsToApi,
  accrualsToForm,
} from "@/lib/zod-schemas/accrual";
import { AccrualRowsEditor } from "./accrual-rows-editor";

const ROW_FIELD = /^rows\.\d+\.(representativeId|categoryId|amount)$/;

/** The row input an API error is about, if any */
function rowField(error: unknown) {
  return error instanceof ApiError && error.field && ROW_FIELD.test(error.field)
    ? (error.field as Path<AccrualFormInput>)
    : null;
}

/** The Tahakkuk page: the one list, loaded once then edited in place */
export function Accruals() {
  const { data, isError } = useQuery({
    queryKey: ["accruals"],
    queryFn: () => getAccruals(),
  });

  if (isError && !data) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Tahakkuk yüklenirken bir hata oluştu.
      </p>
    );
  }
  return data ? <AccrualsForm list={data} /> : null;
}

/**
 * Edits the list. A save carries the version the page started from, so a
 * save over someone else's is refused (and the edits stay on screen).
 */
function AccrualsForm({ list }: { list: AccrualList }) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(list.version);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const form = useForm({
    resolver: zodResolver(accrualFormSchema),
    defaultValues: { rows: accrualsToForm(list.rows) },
  });
  const { isDirty } = form.formState;

  // a refetch brought someone else's save while nothing was being edited
  // here: show theirs. Only a list that changed counts, not the gap between
  // this page's own save and its refetch.
  const seenListVersion = useRef(list.version);
  useEffect(() => {
    if (list.version === seenListVersion.current) return;
    seenListVersion.current = list.version;
    if (list.version === version || form.formState.isDirty) return;
    form.reset({ rows: accrualsToForm(list.rows) });
    setVersion(list.version);
  }, [list, version, form]);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: (values: AccrualFormValues) =>
      saveAccruals(accrualsToApi(values.rows), version),
    onSuccess: (newVersion, values) => {
      // what was sent is what the server stored
      form.reset({ rows: accrualsToForm(accrualsToApi(values.rows)) });
      setVersion(newVersion);
      setSavedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: ["accruals"] });
      // yetkili pages count tahakkuk rows (the delete check)
      void queryClient.invalidateQueries({ queryKey: ["representatives"] });
    },
    onError: (error) => {
      // e.g. "Pasif yetkili eklenemez" under that row's Yetkili
      const field = rowField(error);
      if (field) form.setError(field, { message: error.message });
      // e.g. someone saved first: have their list ready for İptal
      else void queryClient.invalidateQueries({ queryKey: ["accruals"] });
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      className="flex max-w-5xl flex-col"
      noValidate
    >
      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-4 py-2.5 text-sm font-medium">Tahakkuk</h2>
        {/* nothing typed while saving, so the reset after it loses nothing */}
        <fieldset disabled={isPending} className="p-4">
          <AccrualRowsEditor control={form.control} current={list.rows} />
        </fieldset>
      </section>

      <SaveBar
        dirty={isDirty}
        saving={isPending}
        error={error && !rowField(error) ? error : null}
        savedAt={savedAt}
        savedText="Tahakkuk kaydedildi"
        onDiscard={() => {
          // back to the latest saved list, which may be someone else's newer
          // one that came in while this page had edits
          form.reset({ rows: accrualsToForm(list.rows) });
          setVersion(list.version);
          reset();
          void queryClient.invalidateQueries({ queryKey: ["accruals"] });
        }}
      />
    </form>
  );
}
