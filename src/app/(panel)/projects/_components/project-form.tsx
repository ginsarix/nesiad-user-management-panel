"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Path, useForm } from "react-hook-form";
import { PledgesEditor } from "@/components/pledges-editor";
import { ProjectFields } from "@/components/project-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { ApiError } from "@/lib/fetches/errors";
import {
  createProject,
  type Project,
  updateProject,
} from "@/lib/fetches/project";
import { listHref } from "@/lib/list-href";
import {
  type PledgeInput,
  type ProjectFormInput,
  type ProjectFormValues,
  pledgesToApi,
  pledgesToForm,
  projectFormSchema,
} from "@/lib/zod-schemas/project";

const FIELDS = ["name", "number", "active"];
const PLEDGE_FIELD = /^pledges\.\d+\.(representativeId|quantity|amount)$/;

/** Whether the rows read the same as the saved ones they started from */
function samePledges(
  rows: readonly PledgeInput[],
  saved: readonly PledgeInput[],
) {
  return (
    rows.length === saved.length &&
    rows.every(
      (row, i) =>
        row.representativeId === saved[i].representativeId &&
        row.quantity === saved[i].quantity &&
        row.amount === saved[i].amount,
    )
  );
}

/** The input an API error is about, when the form shows that input */
function formField(error: unknown) {
  if (!(error instanceof ApiError) || !error.field) return null;
  return FIELDS.includes(error.field) || PLEDGE_FIELD.test(error.field)
    ? (error.field as Path<ProjectFormInput>)
    : null;
}

/** Create form without a proje, edit form with one */
export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? "",
      number: project?.number ?? "",
      active: project?.active ?? true,
      pledges: pledgesToForm(project?.pledges ?? []),
    },
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const pledges = pledgesToApi(values.pledges);
      if (!project) return await createProject({ ...values, pledges });
      // untouched taahhütler aren't sent, so this page doesn't undo rows
      // saved on the details page while it was open
      await updateProject(project.id, {
        ...values,
        pledges: samePledges(pledges, project.pledges) ? undefined : pledges,
      });
      return project.id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        // tahsilatlar show the proje's name and number
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        // yetkili pages count taahhütler (the delete check)
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
      ]);
      router.push(`/projects/${id}`);
    },
    // e.g. "Bu proje numarası zaten var" under Proje Numarası, "Pasif
    // yetkili eklenemez" under a taahhüt's Yetkili
    onError: (error) => {
      const field = formField(error);
      if (field) form.setError(field, { message: error.message });
    },
  });
  const formError = error && !formField(error) ? error : null;

  const backHref = project ? `/projects/${project.id}` : listHref("/projects");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {project ? "Projeye dön" : "Projelere dön"}
      </Link>

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {project ? "Projeyi Düzenle" : "Yeni Proje"}
          </h2>
          <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
            <ProjectFields control={form.control} prefix="" />
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            Taahhütler
          </h2>
          <div className="p-4">
            <PledgesEditor
              control={form.control}
              current={project?.pledges ?? []}
            />
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
