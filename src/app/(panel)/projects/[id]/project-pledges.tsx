"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Path, useForm } from "react-hook-form";
import { AmountRowsEditor } from "@/components/amount-rows-editor";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/fetches/errors";
import { type Project, savePledges } from "@/lib/fetches/project";
import { shakeElement, useNavigationGuard } from "@/lib/navigation-guard";
import { PLEDGE_LABELS } from "@/lib/projects";
import { cn } from "@/lib/utils";
import {
  amountRowsToApi,
  amountRowsToForm,
} from "@/lib/zod-schemas/amount-rows";
import {
  type PledgesFormInput,
  type PledgesFormValues,
  pledgesFormSchema,
} from "@/lib/zod-schemas/project";

const PLEDGE_FIELD = /^pledges\.\d+\.(representativeId|quantity|amount)$/;
const SAVED_NOTICE_MS = 3000;

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
  const bar = useRef<HTMLElement>(null);
  const [leaveAttempted, setLeaveAttempted] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const form = useForm({
    resolver: zodResolver(pledgesFormSchema),
    defaultValues: { pledges: amountRowsToForm(project.pledges) },
  });
  const { isDirty } = form.formState;

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: (values: PledgesFormValues) =>
      savePledges(project.id, amountRowsToApi(values.pledges)),
    onSuccess: (_, values) => {
      // what was sent is what the server stored: the form's new starting
      // point, without waiting for (or depending on) the refetch below
      form.reset({
        pledges: amountRowsToForm(amountRowsToApi(values.pledges)),
      });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      // yetkili pages count taahhütler (the delete check)
      void queryClient.invalidateQueries({ queryKey: ["representatives"] });
      setLeaveAttempted(false);
      setJustSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(
        () => setJustSaved(false),
        SAVED_NOTICE_MS,
      );
    },
    // e.g. "Pasif yetkili eklenemez" under that row's Yetkili
    onError: (error) => {
      const field = pledgeField(error);
      if (field) form.setError(field, { message: error.message });
    },
  });
  const barError = error && !pledgeField(error) ? error : null;

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  useNavigationGuard(isDirty, () => {
    setLeaveAttempted(true);
    requestAnimationFrame(() => shakeElement(bar.current));
  });
  const pointOutBar = leaveAttempted && isDirty;

  function discard() {
    form.reset();
    reset();
    setLeaveAttempted(false);
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        setJustSaved(false);
        mutate(values);
      })}
      noValidate
      // room to scroll the last rows above the bar
      className={cn((isDirty || justSaved) && "pb-24")}
    >
      <section className="rounded-lg border bg-card">
        <h3 className="border-b px-4 py-2.5 text-sm font-medium">Taahhütler</h3>
        {/* nothing typed while saving, so the reset after it loses nothing */}
        <fieldset disabled={isPending} className="p-4">
          <AmountRowsEditor
            control={form.control}
            name="pledges"
            labels={PLEDGE_LABELS}
            current={project.pledges}
          />
        </fieldset>
      </section>

      {(isDirty || justSaved) && (
        <section
          ref={bar}
          aria-label="Kaydedilmemiş değişiklikler"
          className={cn(
            "fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 shadow-lg transition-[border-color,box-shadow] animate-in fade-in-0 slide-in-from-bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6",
            pointOutBar && "border-destructive ring-3 ring-destructive/20",
          )}
        >
          <div aria-live="polite" className="mr-auto text-sm">
            {justSaved && !isDirty ? (
              <span className="flex items-center gap-1.5 text-primary">
                <CircleCheck className="size-4" />
                Taahhütler kaydedildi
              </span>
            ) : barError ? (
              <span className="text-destructive">
                Kaydedilemedi. {barError.message}
              </span>
            ) : pointOutBar ? (
              <span className="text-destructive">
                Sayfadan ayrılmadan önce değişiklikleri kaydedin ya da iptal
                edin.
              </span>
            ) : (
              "Kaydedilmemiş değişiklikler var"
            )}
          </div>
          {isDirty && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={discard}
              >
                İptal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          )}
        </section>
      )}
    </form>
  );
}
